import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in · CFB Prospect Report" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <LoginForm next={next ?? "/"} />;
}
