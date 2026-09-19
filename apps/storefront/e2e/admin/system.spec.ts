import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { mailhogLink, uniqueEmail } from "../support";
import { clearChaos, expect, guestApi, mutate, query, test, withCaptcha } from "./fixtures";

type Overview = {
  services: { service: string; breakers: { name: string; state: string }[]; messaging: { queues: { queue: string; dlq: { queue: string } }[] } | null }[];
};
type Letter = { id: string; payload: unknown };

// The DLQ test waits for a message to exhaust every retry tier, so its timing follows the stack's RABBIT_RETRY_DELAYS_MS:
// CI uses 1s/2s/4s, the dev .env the realistic 5s/30s/120s. Read the same value the services were started with.
loadEnvConfig(path.resolve(__dirname, "../../../.."));
const RETRY_TOTAL_MS = (process.env.RABBIT_RETRY_DELAYS_MS ?? "1000,2000,4000")
  .split(",")
  .map((ms) => Number(ms.trim()) || 0)
  .reduce((sum, ms) => sum + ms, 0);

test("system page shows service health, dependency checks, breakers, queues and consumer groups with 5 s auto-refresh", async ({ page }) => {
  let overviewCalls = 0;
  page.on("request", (r) => {
    if (r.url().includes("admin.system.overview")) overviewCalls += 1;
  });
  await page.goto("/admin/system");
  await expect(page.getByRole("heading", { level: 1, name: "System" })).toBeVisible({ timeout: 30_000 });

  const summary = page.getByLabel("System summary");
  await expect(summary).toContainText("Services healthy", { timeout: 30_000 });
  await expect(summary).toContainText(/\d+ \/ 8/);
  await expect(summary).toContainText("Open breakers");
  await expect(summary).toContainText("Outbox backlog");

  const notification = page.getByRole("article", { name: "notification-service" });
  await expect(notification.getByText("Healthy", { exact: true })).toBeVisible();
  const deps = notification.getByRole("list", { name: "notification-service dependency checks" });
  for (const dep of ["postgres", "redis", "kafka", "rabbitmq"]) await expect(deps).toContainText(`${dep} up`);
  await expect(notification.getByRole("heading", { name: "Transactional outbox" })).toBeVisible();
  await expect(notification.getByText("Oldest pending")).toBeVisible();
  await expect(notification.getByRole("cell", { name: "notification.send-email", exact: true })).toBeVisible();
  await expect(notification.getByRole("columnheader", { name: "DLQ" })).toBeVisible();
  await expect(notification.getByRole("cell", { name: /notification-dispatcher/ })).toBeVisible();
  await expect(notification.getByRole("columnheader", { name: "Lag" })).toBeVisible();
  await expect(notification.getByRole("columnheader", { name: "DLT" })).toBeVisible();
  const smtp = notification.getByRole("row", { name: "Breaker smtp" });
  await expect(smtp.getByText(/^(Closed|Half-open|Open)$/)).toBeVisible();

  await expect(page.getByRole("article")).toHaveCount(8);
  const bff = page.getByRole("region", { name: "Storefront BFF breakers" });
  await expect(bff.getByRole("row", { name: "Breaker catalog" })).toBeVisible();

  // Auto-refresh: the overview is fetched again within a few seconds and the age label resets.
  const updated = page.getByTestId("system-updated");
  await expect(updated).toHaveText(/^Updated \d+s ago/);
  const before = overviewCalls;
  await expect.poll(() => overviewCalls, { timeout: 15_000 }).toBeGreaterThan(before + 1);
  await page.getByRole("switch", { name: "Auto-refresh every 5 s" }).click();
  await expect(page.getByRole("switch", { name: "Auto-refresh every 5 s" })).not.toBeChecked();
  await expect(updated).toHaveText(/^Updated ([3-9]|\d{2,})s ago/, { timeout: 15_000 });

  await page.getByRole("button", { name: "Rebuild search index" }).click();
  await page.getByRole("dialog", { name: "Rebuild the search index?" }).getByRole("button", { name: "Rebuild now" }).click();
  await expect(page.getByText("Search rebuild started")).toBeVisible({ timeout: 20_000 });
});

test("chaos rule set and clear on a service from the system page", async ({ page, admin }) => {
  const target = `e2e.noop.${randomBytes(3).toString("hex")}`;
  try {
    await page.goto("/admin/system");
    const chaos = page.getByRole("region", { name: "Chaos controls" });
    await expect(chaos.getByRole("form", { name: "Set chaos rule" })).toBeVisible({ timeout: 30_000 });
    await chaos.getByRole("combobox", { name: "Service" }).click();
    await page.getByRole("option", { name: "search-worker" }).click();
    await expect(chaos.getByText("No active chaos rules on search-worker.")).toBeVisible({ timeout: 20_000 });
    await expect(chaos.getByRole("button", { name: "handler:kafka:search-indexer" })).toBeVisible();

    const form = chaos.getByRole("form", { name: "Set chaos rule" });
    await form.getByRole("button", { name: "Set chaos rule" }).click();
    await expect(form.getByText("Enter an injection point, or pick one below.")).toBeVisible();
    await form.getByLabel("Target").fill(target);
    await form.getByRole("combobox", { name: "Fault" }).click();
    await page.getByRole("option", { name: /^Delay/ }).click();
    await form.getByLabel("Rate (%)").fill("50");
    await form.getByLabel("Delay (ms)").fill("100");
    await form.getByLabel("TTL (s)").fill("30");
    await form.getByRole("button", { name: "Set chaos rule" }).click();
    await expect(page.getByText("Chaos rule set on search-worker")).toBeVisible({ timeout: 20_000 });

    const rules = chaos.getByRole("table", { name: "Chaos rules on search-worker" });
    const row = rules.getByRole("row").filter({ hasText: target });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row).toContainText("delay");
    await expect(row).toContainText("50%");
    await expect(row).toContainText("100 ms");
    await expect(row).toContainText(/\d+s/);
    const listed = await query<{ target: string; rate: number }[]>(admin, "admin.system.chaos.list", { service: "search-worker" });
    expect(listed.find((r) => r.target === target)?.rate).toBe(0.5);

    await row.getByRole("button", { name: `Clear chaos at ${target}` }).click();
    await expect(page.getByText(`Cleared chaos at ${target}`)).toBeVisible({ timeout: 20_000 });
    await expect(row).toBeHidden({ timeout: 20_000 });
  } finally {
    await clearChaos(admin, "search-worker", target);
  }
});

test("dead letter browser shows a redacted DLQ message and replays it once the fault is cleared", async ({ page, admin }) => {
  test.setTimeout(RETRY_TOTAL_MS + 180_000);
  const email = uniqueEmail("admin-dlq");
  const overview = await query<Overview>(admin, "admin.system.overview");
  const dlq = overview.services.find((s) => s.service === "notification-service")?.messaging?.queues.find((q) => q.queue.endsWith("notification.send-email"))?.dlq.queue;
  expect(dlq, "notification-service reports its send-email DLQ").toBeTruthy();

  try {
    // A real failure: every SMTP send fails, so the newsletter confirmation exhausts its retry tiers into the DLQ.
    await mutate(admin, "admin.system.chaos.set", { service: "notification-service", target: "smtp.send", fault: "fail", rate: 1, delayMs: 0, ttlSec: Math.ceil(RETRY_TOTAL_MS / 1000) + 60 });
    const visitor = await guestApi();
    try {
      await withCaptcha(visitor, "newsletter.subscribe", { email });
    } finally {
      await visitor.dispose();
    }
    await expect
      .poll(
        async () => {
          const letters = await query<Letter[]>(admin, "admin.system.deadLetters", { service: "notification-service", source: "rabbit", queueOrTopic: dlq, limit: 200 });
          return letters.some((l) => JSON.stringify(l.payload).includes(email));
        },
        { timeout: RETRY_TOTAL_MS + 60_000, intervals: [1000, 2000] },
      )
      .toBe(true);
  } finally {
    await clearChaos(admin, "notification-service", "smtp.send");
  }

  // The failures opened the smtp breaker; replaying into an open breaker would dead-letter again.
  await expect
    .poll(
      async () => (await query<Overview>(admin, "admin.system.overview")).services.find((s) => s.service === "notification-service")?.breakers.find((b) => b.name === "smtp")?.state ?? "unknown",
      { timeout: 45_000, intervals: [1000] },
    )
    .not.toBe("open");

  await page.goto("/admin/system");
  const browser = page.getByRole("region", { name: "Dead-letter browser" });
  await expect(browser.getByText("Choose where to look")).toBeVisible({ timeout: 30_000 });
  await browser.getByRole("combobox", { name: "Service" }).click();
  await page.getByRole("option", { name: "notification-service" }).click();
  await browser.getByRole("combobox", { name: "Source" }).click();
  await page.getByRole("option", { name: "RabbitMQ dead-letter queue" }).click();
  await browser.getByRole("combobox", { name: "Queue" }).click();
  await page.getByRole("option", { name: /^notification\.send-email\.dlq/ }).click();

  const letter = browser.getByRole("listitem", { name: "Dead letter notification.send-email" }).filter({ hasText: email });
  await expect(letter).toBeVisible({ timeout: 30_000 });
  await expect(letter).toContainText(/\d+ attempts/);
  await expect(letter).toContainText("Last error:");
  // The last error is the injected SMTP fault or, once it has opened, the smtp breaker rejecting the call.
  await expect(letter).toContainText(/smtp\.send|Chaos|breaker|temporarily unavailable/i);
  await expect(letter.getByRole("button", { name: "Copy correlation id" })).toBeVisible();
  await expect(letter).toContainText("[redacted]");
  await expect(letter).not.toContainText("token=");

  await letter.getByRole("button", { name: "Expand" }).click();
  await expect(letter.getByText(/"confirmUrl": "\[redacted\]"/)).toBeVisible();
  await expect(letter.getByText(/"template": "newsletter-confirm"/)).toBeVisible();

  await letter.getByRole("button", { name: /^Replay notification\.send-email/ }).click();
  await expect(page.getByText("Replayed 1 message")).toBeVisible({ timeout: 30_000 });
  await expect(letter).toBeHidden({ timeout: 30_000 });

  // Replayed with the fault gone, the confirmation email is delivered for real.
  const link = await mailhogLink(email, /newsletter\/confirm\?token=/, { timeoutMs: 60_000 });
  expect(link).toContain("token=");
});
