"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Use at least 8 characters for your new password.");
      return;
    }
    if (password !== confirm) {
      setError("The passwords do not match.");
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Cloud authentication is not configured.");
      return;
    }
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
      } else {
        setSuccess(true);
        setTimeout(() => router.replace("/"), 1200);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update your password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f2f4f5] px-4 py-10">
      <form onSubmit={submit} className="w-full max-w-[420px] space-y-4 rounded-2xl bg-white p-7 shadow-[0_2px_16px_rgba(0,0,0,0.08)]">
        <div>
          <h1 className="text-center text-xl font-extrabold text-[#111418]">Reset your Blockyard password</h1>
          <p className="mt-2 text-center text-sm text-[#697078]">Choose a new password for your account.</p>
        </div>
        <label className="block text-sm font-semibold text-[#3f4347]">
          New password
          <input className="mt-1 h-11 w-full rounded-lg border border-[#d6d9db] px-3 text-[#111418] outline-none focus:border-[#00b06f]" type="password" autoComplete="new-password" minLength={8} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <label className="block text-sm font-semibold text-[#3f4347]">
          Confirm new password
          <input className="mt-1 h-11 w-full rounded-lg border border-[#d6d9db] px-3 text-[#111418] outline-none focus:border-[#00b06f]" type="password" autoComplete="new-password" minLength={8} maxLength={128} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </label>
        {error && <p role="alert" className="rounded-lg bg-[#fdf1f1] px-3 py-2 text-sm text-[#c0392b]">{error}</p>}
        {success && <p role="status" className="rounded-lg bg-[#edfaf4] px-3 py-2 text-sm text-[#087f50]">Password updated. Returning to Blockyard…</p>}
        <button type="submit" disabled={busy || success} className="h-11 w-full rounded-full bg-[#00b06f] text-sm font-bold text-white disabled:opacity-50">{busy ? "Updating…" : "Save new password"}</button>
      </form>
    </main>
  );
}
