import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { demoMode } from "@/lib/demo/mode";

export default async function HomePage() {
  const session = await getSession();
  if (session) redirect("/dashboard");
  // The portfolio demo has no reason to show a login wall — visitors go
  // straight to the persona chooser. Production keeps sending to /login.
  redirect(demoMode() ? "/demo" : "/login");
}
