"use client";

import { useEffect, useState } from "react";
import { Blocks, Eye, EyeOff, Info, Lock, Mail, User } from "lucide-react";
import { useWeb } from "@/lib/studio/webstore";
import { supabaseConfigured } from "@/lib/supabase/client";

/** Cloud account login. Supabase Auth owns passwords and browser sessions. */
export function LoginPage() {
  const login = useWeb((s) => s.login);
  const signup = useWeb((s) => s.signup);
  const requestPasswordReset = useWeb((s) => s.requestPasswordReset);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("auth_error");
    if (!authError) return;
    const messages: Record<string, string> = {
      missing_code: "The email link is missing its confirmation code. Request a new email and try again.",
      auth_not_configured: "Supabase is not configured for this website.",
      confirmation_failed: "That confirmation link is invalid or expired. Request a new email and try again.",
    };
    setError(messages[authError] ?? "Authentication could not be completed. Please try again.");
    window.history.replaceState({}, document.title, window.location.pathname);
  }, []);

  const sendPasswordReset = async () => {
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const result = await requestPasswordReset(email);
      if (result.ok) {
        setResetSent(true);
        setSuccess("If the address belongs to a Blockyard account, a password-reset email has been sent. Open its link to choose a new password.");
      } else {
        setError(result.error ?? "Could not send the password-reset email.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the password-reset email.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const res = mode === "login"
        ? await login(email, password)
        : await signup(email, username, password);
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
      } else if (mode === "signup" && res.confirmationRequired) {
        setSuccess("Account created. Check your email and open the confirmation link to finish signing in to Blockyard.");
        setMode("login");
        setPassword("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };



  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f2f4f5] px-4 py-10">
      <main className="w-full max-w-[420px]">
        <div className="mb-5 flex items-center justify-center gap-2.5">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#111418] text-white shadow-md">
            <Blocks size={24} strokeWidth={2.4} />
          </div>
          <span className="text-[30px] font-extrabold tracking-tight text-[#111418]">BLOCKYARD</span>
        </div>

        <div className="rounded-2xl bg-white p-7 shadow-[0_2px_16px_rgba(0,0,0,0.08)]">
          <h1 className="mb-5 text-center text-[19px] font-bold text-[#111418]">
            {mode === "login" ? "Log In" : "Create your account"}
          </h1>

          <form onSubmit={submit} className="space-y-3.5">
            {mode === "signup" && (
              <label className="block">
                <span className="mb-1 block text-[12.5px] font-semibold text-[#3f4347]">Username</span>
                <span className="flex items-center gap-2 rounded-lg border border-[#d6d9db] bg-white px-3 focus-within:border-[#00b06f] focus-within:ring-2 focus-within:ring-[#00b06f]/20">
                  <User size={15} className="shrink-0 text-[#9aa0a6]" />
                  <input
                    className="h-10 flex-1 bg-transparent text-[14px] text-[#111418] outline-none placeholder:text-[#b9bfc4]"
                    placeholder="Choose a username"
                    value={username}
                    maxLength={20}
                    autoComplete="username"
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </span>
              </label>
            )}

            <label className="block">
              <span className="mb-1 block text-[12.5px] font-semibold text-[#3f4347]">Email address</span>
              <span className="flex items-center gap-2 rounded-lg border border-[#d6d9db] bg-white px-3 focus-within:border-[#00b06f] focus-within:ring-2 focus-within:ring-[#00b06f]/20">
                <Mail size={15} className="shrink-0 text-[#9aa0a6]" />
                <input
                  className="h-10 flex-1 bg-transparent text-[14px] text-[#111418] outline-none placeholder:text-[#b9bfc4]"
                  placeholder="you@example.com"
                  type="email"
                  value={email}
                  autoComplete="email"
                  onChange={(e) => setEmail(e.target.value)}
                />
              </span>
            </label>

            <label className="block">
              <span className="mb-1 block text-[12.5px] font-semibold text-[#3f4347]">Password</span>
              <span className="flex items-center gap-2 rounded-lg border border-[#d6d9db] bg-white px-3 focus-within:border-[#00b06f] focus-within:ring-2 focus-within:ring-[#00b06f]/20">
                <Lock size={15} className="shrink-0 text-[#9aa0a6]" />
                <input
                  className="h-10 flex-1 bg-transparent text-[14px] text-[#111418] outline-none placeholder:text-[#b9bfc4]"
                  placeholder={mode === "signup" ? "At least 8 characters" : "Enter your password"}
                  type={showPw ? "text" : "password"}
                  value={password}
                  maxLength={128}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button type="button" className="text-[#9aa0a6] hover:text-[#3f4347]" onClick={() => setShowPw((v) => !v)} title={showPw ? "Hide password" : "Show password"}>
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </span>
            </label>

            {error && <div role="alert" className="rounded-lg border border-[#f3c2c2] bg-[#fdf1f1] px-3 py-2 text-[12px] text-[#c0392b]">{error}</div>}
            {success && <div role="status" className="rounded-lg border border-[#b7e8d2] bg-[#edfaf4] px-3 py-2 text-[12px] text-[#087f50]">{success}</div>}
            {!supabaseConfigured() && (
              <div className="rounded-lg border border-[#f3d59a] bg-[#fff9e9] px-3 py-2 text-[12px] text-[#806016]">
                Cloud authentication is not configured yet. Add the Supabase URL and publishable key to your hosting environment, then redeploy.
              </div>
            )}

            <button
              type="submit"
              disabled={busy || !email || !password || (mode === "signup" && !username) || !supabaseConfigured()}
              className="h-11 w-full rounded-full bg-[#00b06f] text-[15px] font-bold text-white transition-colors hover:bg-[#009a61] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Please wait…" : mode === "login" ? "Log In" : "Sign Up"}
            </button>
          </form>

          <div className="mt-4 space-y-2 text-center text-[12.5px]">
            {mode === "login" ? (
              <>
                <div>
                  <button type="button" disabled={busy || !email || !supabaseConfigured() || resetSent} className="font-semibold text-[#0f6dcf] hover:underline disabled:opacity-50" onClick={() => void sendPasswordReset()}>
                    Forgot password? Send reset email
                  </button>
                </div>
                <div className="text-[#5c6166]">
                  Don&apos;t have an account?{" "}
                  <button type="button" className="font-semibold text-[#0f6dcf] hover:underline" onClick={() => { setMode("signup"); setError(null); setSuccess(null); }}>
                    Sign Up
                  </button>
                </div>
              </>
            ) : (
              <div className="text-[#5c6166]">
                Already have an account?{" "}
                <button type="button" className="font-semibold text-[#0f6dcf] hover:underline" onClick={() => { setMode("login"); setError(null); setSuccess(null); }}>
                  Log In
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#d6d9db] bg-white/80 p-4 text-left">
          <Info size={16} className="mt-0.5 shrink-0 text-[#00b06f]" />
          <p className="text-[11.5px] leading-relaxed text-[#5c6166]">
            Blockyard uses Supabase for cloud accounts. Your password is handled by Supabase Auth and is not stored in Blockyard browser storage. Use an email address you can access to confirm your account.
          </p>
        </div>
      </main>
    </div>
  );
}
