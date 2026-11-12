"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { Blocks } from "lucide-react";
import { useWeb } from "@/lib/studio/webstore";
import { LoginPage } from "@/components/web/LoginPage";
import WebApp from "@/components/web/WebApp";

const StudioApp = dynamic(() => import("@/components/studio/StudioApp"), {
  ssr: false,
  loading: () => (
    <div className="grid h-screen w-screen place-items-center bg-[#111214] text-[#9aa0a8]">
      <div className="text-center">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-md border-2 border-[#34373c] border-t-[#75dda4]" />
        Loading Blockyard Studio…
      </div>
    </div>
  ),
});

const GamePlayer = dynamic(() => import("@/components/web/GamePlayer"), {
  ssr: false,
  loading: () => (
    <div className="grid h-screen w-screen place-items-center bg-[#0b0d10] text-[#9aa0a8]">
      <div className="text-center">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-md border-2 border-[#34373c] border-t-[#75dda4]" />
        Joining experience…
      </div>
    </div>
  ),
});

function Splash() {
  return (
    <div className="grid h-screen w-screen place-items-center bg-[#f2f4f5]">
      <div className="flex flex-col items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-[#111418] text-white">
          <Blocks size={24} strokeWidth={2.4} />
        </div>
        <div className="h-1 w-32 animate-pulse rounded-full bg-[#00b06f]" />
      </div>
    </div>
  );
}

export default function Page() {
  const hydrated = useWeb((s) => s.hydrated);
  const view = useWeb((s) => s.view);

  useEffect(() => {
    useWeb.getState().hydrate();
  }, []);

  if (!hydrated) return <Splash />;
  if (view === "login") return <LoginPage />;
  if (view === "web") return <WebApp />;
  if (view === "player") return <GamePlayer />;
  return <StudioApp />;
}
