import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function Home() {
  const authed = await getSession();
  redirect(authed ? "/dashboard" : "/login");
}
