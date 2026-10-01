"use client";

import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="card mx-auto mt-24 max-w-sm space-y-4 p-6">
      <h1 className="text-xl font-semibold">CFB Prospect Report</h1>
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="label">Password</span>
        <input name="password" type="password" autoFocus required className="input mt-1" />
      </label>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}
