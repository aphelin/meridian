import { expect, test } from "@playwright/test";
import { passTurnstile, uniqueEmail } from "../support";
import { expectIndexableMetadata, waitForMail } from "./helpers";

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL ?? "support@meridian.local";

test.describe("contact", () => {
  test("contact form validates, sends topic, order number and message with Turnstile, and emails support and the sender", async ({ page }) => {
    test.setTimeout(120_000);
    const email = uniqueEmail("contact");
    const orderNumber = `M-${Date.now().toString(36).slice(-8).toUpperCase()}`;
    const message = `Hello, my sofa order ${orderNumber} has a question about delivery timing. (${email})`;

    await page.goto("/");
    await page.getByRole("contentinfo").getByRole("link", { name: "Contact" }).click();
    await expect(page).toHaveURL(/\/contact$/);
    await expect(page.getByRole("heading", { level: 1, name: "Contact us" })).toBeVisible();
    await expectIndexableMetadata(page, { title: /Contact us · Meridian/, path: "/contact" });

    const form = page.getByRole("form", { name: "Contact us" });
    const submit = form.getByRole("button", { name: "Send message" });
    await passTurnstile(page, form);
    await expect(submit).toBeEnabled();

    // Client-side validation names every problem and focuses the first field.
    await submit.click();
    await expect(form.getByText("Tell us your name.")).toBeVisible();
    await expect(form.getByText("Choose what your message is about.")).toBeVisible();
    await expect(form.getByText("Tell us a little more (at least 10 characters).")).toBeVisible();
    await expect(form.getByLabel("Name", { exact: true })).toBeFocused();
    await expect(form.getByLabel("Name", { exact: true })).toHaveAttribute("aria-invalid", "true");

    await form.getByLabel("Name", { exact: true }).fill("Ines Contact");
    await form.getByLabel("Email", { exact: true }).fill(email);
    const topic = form.getByRole("combobox", { name: "Topic" });
    await topic.click();
    await page.getByRole("option", { name: "An order" }).click();
    await expect(topic).toHaveText(/An order/);
    await form.getByLabel(/Order number/).fill(orderNumber.toLowerCase());
    await form.getByLabel("Message", { exact: true }).fill(message);
    await expect(form.getByText("Tell us your name.")).toBeHidden();
    await passTurnstile(page, form);
    await submit.click();

    const done = page.getByRole("status").filter({ hasText: "Your message is with us" });
    await expect(done).toBeVisible({ timeout: 20_000 });
    await expect(done).toContainText(email);
    await expect(page.getByRole("heading", { name: "Thanks, Ines. Your message is with us" })).toBeVisible();

    // Support receives the internal email with every field; the sender gets the receipt.
    const internal = await waitForMail(SUPPORT_EMAIL, { subject: /Contact form: An order from Ines Contact/, contains: [email, orderNumber] });
    expect(internal.replyTo).toContain(email);
    expect(internal.body).toContain("delivery timing");
    const receipt = await waitForMail(email, { subject: /We received your message/ });
    expect(receipt.body).toContain("Ines");

    // "Send another message" returns to a fresh form that keeps name and email.
    await page.getByRole("button", { name: "Send another message" }).click();
    await expect(form.getByLabel("Email", { exact: true })).toHaveValue(email);
    await expect(form.getByLabel("Message", { exact: true })).toHaveValue("");
  });
});
