import { useState, type FormEvent } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import * as api from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";

async function completeLogin(token: string, login: (t: string, u: string, p: boolean) => void, setProfileInfo: (a: string, l: string) => void) {
  const me = await api.getMe(token);
  login(token, me.username, me.has_profile);
  if (me.has_profile) {
    const profile = await api.getProfile(token);
    if (profile) setProfileInfo(profile.assistant_name, profile.response_language);
  }
}

export function AuthPage() {
  const { login, setProfileInfo } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const username = String(form.get("username") || "");
    const password = String(form.get("password") || "");
    if (!username || !password) {
      setError("Enter both username and password.");
      return;
    }
    setBusy(true);
    try {
      const { access_token } = await api.login(username, password);
      await completeLogin(access_token, login, setProfileInfo);
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRegister(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const username = String(form.get("username") || "");
    const password = String(form.get("password") || "");
    const confirm = String(form.get("confirm") || "");
    if (!username || !password) {
      setError("Enter both a username and password.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      const { access_token } = await api.register(username, password);
      await completeLogin(access_token, login, setProfileInfo);
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Missy</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your personal AI operating system</p>
        </div>

        <Tabs defaultValue="login" onValueChange={() => setError(null)}>
          <TabsList className="mb-6 w-full">
            <TabsTrigger value="login" className="flex-1">
              Log in
            </TabsTrigger>
            <TabsTrigger value="register" className="flex-1">
              Register
            </TabsTrigger>
          </TabsList>

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <TabsContent value="login">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="login-username">Username</Label>
                <Input id="login-username" name="username" autoComplete="username" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="login-password">Password</Label>
                <Input id="login-password" name="password" type="password" autoComplete="current-password" />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Logging in…" : "Log in"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="register">
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="reg-username">Choose a username</Label>
                <Input id="reg-username" name="username" autoComplete="username" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-password">Choose a password</Label>
                <Input id="reg-password" name="password" type="password" autoComplete="new-password" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-confirm">Confirm password</Label>
                <Input id="reg-confirm" name="confirm" type="password" autoComplete="new-password" />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Creating account…" : "Create account"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
