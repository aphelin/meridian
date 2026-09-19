"use client";

import type { ChaosFault } from "@meridian/contracts";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { focusFirstInvalid } from "@/lib/validation";
import { duration, EmptyState, ErrorState, Field, StateChip, useNow } from "../kit";
import { chaosTargets, type SystemOverview } from "./shared";

const FAULTS: { value: ChaosFault; label: string; hint: string }[] = [
  { value: "fail", label: "Fail", hint: "throws immediately" },
  { value: "delay", label: "Delay", hint: "waits, then continues" },
  { value: "timeout", label: "Timeout", hint: "waits, then throws" },
];

/** Dev-only fault injection per service: rules live in Redis, so every replica of the service applies them. */
export function ChaosControls({ overview, services, autoRefresh }: { overview: SystemOverview | undefined; services: string[]; autoRefresh: boolean }) {
  const utils = trpc.useUtils();
  const now = useNow(1000);
  const [service, setService] = useState("notification-service");
  const [target, setTarget] = useState("");
  const [fault, setFault] = useState<ChaosFault>("fail");
  const [rate, setRate] = useState("100");
  const [delay, setDelay] = useState("2000");
  const [ttl, setTtl] = useState("60");
  const [touched, setTouched] = useState(false);

  const rules = trpc.admin.system.chaos.list.useQuery({ service }, { refetchInterval: autoRefresh ? 5000 : false });
  const refresh = () => void utils.admin.system.chaos.list.invalidate({ service });
  const set = trpc.admin.system.chaos.set.useMutation({
    onSuccess: (rule) => {
      toast.success(`Chaos rule set on ${service}`, { description: `${rule.fault} at ${rule.target}, ${Math.round(rule.rate * 100)}% of calls` });
      setTouched(false);
      refresh();
    },
  });
  const clear = trpc.admin.system.chaos.clear.useMutation({
    onSuccess: (_, input) => {
      toast.success(input.target ? `Cleared chaos at ${input.target}` : `Cleared every chaos rule on ${input.service}`);
      refresh();
    },
  });

  const suggestions = chaosTargets(
    overview?.services.find((s) => s.service === service),
    service,
  );
  const disabled = rules.error?.data?.code === "NOT_FOUND";
  const rateN = Number(rate);
  const delayN = Number(delay);
  const ttlN = Number(ttl);
  const errors = {
    target: target.trim() ? null : "Enter an injection point, or pick one below.",
    rate: /^\d+(\.\d+)?$/.test(rate) && rateN >= 0 && rateN <= 100 ? null : "Use 0 to 100.",
    delay: fault === "fail" || (/^\d+$/.test(delay) && delayN >= 0 && delayN <= 120_000) ? null : "Use 0 to 120000 ms.",
    ttl: /^\d+$/.test(ttl) && ttlN >= 1 && ttlN <= 86_400 ? null : "Use 1 to 86400 seconds.",
  };
  const shown = (k: keyof typeof errors) => (touched ? errors[k] : null);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <span className="label" id="chaos-service-label">
            Service
          </span>
          <Select value={service} onValueChange={setService}>
            <SelectTrigger aria-labelledby="chaos-service-label" className="min-w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              {services.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {disabled ? (
        <EmptyState title="Chaos is disabled on this service" body="Fault injection only runs with CHAOS_ENABLED=true outside production." />
      ) : (
        <>
          <div>
            <h3 className="text-sm font-medium">Active rules</h3>
            <ErrorState className="mt-2" error={rules.error ?? clear.error} what={rules.error ? "Rules could not be read" : "Clear failed"} />
            {rules.isPending ? (
              <Skeleton className="mt-2 h-16" />
            ) : rules.data && !rules.data.length ? (
              <p className="mt-2 text-sm text-stone" role="status">
                No active chaos rules on {service}.
              </p>
            ) : rules.data ? (
              <div className="relative mt-2 overflow-x-auto rounded-[16px] border border-line">
                <table className="w-full min-w-[560px] text-left text-sm" aria-label={`Chaos rules on ${service}`}>
                  <thead className="bg-plaster text-stone">
                    <tr>
                      <th className="px-3 py-2 font-medium">Target</th>
                      <th className="px-3 py-2 font-medium">Fault</th>
                      <th className="px-3 py-2 text-right font-medium">Rate</th>
                      <th className="px-3 py-2 text-right font-medium">Delay</th>
                      <th className="px-3 py-2 font-medium">Expires in</th>
                      <th className="px-3 py-2" aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rules.data.map((r) => {
                      const left = Math.max(0, (Date.parse(r.expiresAt) - now) / 1000);
                      return (
                        <tr key={r.target}>
                          <td className="px-3 py-2 font-medium">{r.target}</td>
                          <td className="px-3 py-2">
                            <StateChip tone="error">{r.fault}</StateChip>
                          </td>
                          <td className="px-3 py-2 text-right tabular">{Math.round(r.rate * 100)}%</td>
                          <td className="px-3 py-2 text-right tabular">{r.fault === "fail" ? "—" : `${r.delayMs} ms`}</td>
                          <td className="px-3 py-2 tabular">{left > 0 ? duration(left) : "expiring"}</td>
                          <td className="px-3 py-2 text-right">
                            <Button
                              variant="secondary"
                              size="sm"
                              className="!min-h-8"
                              pending={clear.isPending && clear.variables?.target === r.target}
                              onClick={() => clear.mutate({ service, target: r.target })}
                              aria-label={`Clear chaos at ${r.target}`}
                            >
                              Clear
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
            {rules.data && rules.data.length > 1 ? (
              <Button variant="quiet" size="sm" className="mt-2" pending={clear.isPending && !clear.variables?.target} onClick={() => clear.mutate({ service })}>
                Clear all rules on {service}
              </Button>
            ) : null}
          </div>

          <form
            aria-label="Set chaos rule"
            className="grid gap-4 rounded-[16px] border border-line p-4 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr_1fr]"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              setTouched(true);
              if (Object.values(errors).some(Boolean)) return focusFirstInvalid(e.currentTarget);
              set.mutate({ service, target: target.trim(), fault, rate: rateN / 100, delayMs: fault === "fail" ? 0 : delayN, ttlSec: ttlN });
            }}
          >
            <Field label="Target" htmlFor="chaos-target" error={shown("target")} className="sm:col-span-2 xl:col-span-1">
              <Input id="chaos-target" className="!min-h-11" placeholder="smtp.send" value={target} onChange={(e) => setTarget(e.target.value)} aria-invalid={!!shown("target")} />
            </Field>
            <Field label="Fault" htmlFor="chaos-fault">
              <Select value={fault} onValueChange={(v) => setFault(v as ChaosFault)}>
                <SelectTrigger id="chaos-fault" className="h-11 rounded-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  {FAULTS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label} · {f.hint}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Rate (%)" htmlFor="chaos-rate" error={shown("rate")}>
              <Input id="chaos-rate" className="!min-h-11 tabular" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} aria-invalid={!!shown("rate")} />
            </Field>
            <Field label="Delay (ms)" htmlFor="chaos-delay" error={shown("delay")}>
              <Input id="chaos-delay" className="!min-h-11 tabular" inputMode="numeric" value={fault === "fail" ? "" : delay} placeholder={fault === "fail" ? "n/a" : undefined} disabled={fault === "fail"} onChange={(e) => setDelay(e.target.value)} aria-invalid={!!shown("delay")} />
            </Field>
            <Field label="TTL (s)" htmlFor="chaos-ttl" error={shown("ttl")}>
              <Input id="chaos-ttl" className="!min-h-11 tabular" inputMode="numeric" value={ttl} onChange={(e) => setTtl(e.target.value)} aria-invalid={!!shown("ttl")} />
            </Field>
            {suggestions.length ? (
              <div className="sm:col-span-2 xl:col-span-5">
                <p className="text-[0.8125rem] text-stone">Injection points on {service}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {suggestions.map((s) => (
                    <button key={s} type="button" className="chip !min-h-8 !px-3 text-[0.8125rem]" aria-pressed={target === s} onClick={() => setTarget(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <ErrorState className="sm:col-span-2 xl:col-span-5" error={set.error} what="Rule not set" />
            <div className="sm:col-span-2 xl:col-span-5">
              <Button type="submit" size="sm" pending={set.isPending}>
                Set chaos rule
              </Button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
