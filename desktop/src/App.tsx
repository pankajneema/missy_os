import { useEffect, useState } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { useAuthStore } from "@/store/auth-store";
import * as api from "@/lib/api";
import { AuthPage } from "@/pages/AuthPage";
import { OnboardingPage } from "@/pages/OnboardingPage";
import { ChatPage } from "@/pages/ChatPage";
import { VoicePage } from "@/pages/VoicePage";
import { KnowledgePage } from "@/pages/KnowledgePage";
import { MemoryPage } from "@/pages/MemoryPage";
import { JobsPage } from "@/pages/JobsPage";
import { ApiConnectionsPage } from "@/pages/ApiConnectionsPage";
import { McpServersPage } from "@/pages/McpServersPage";
import { ConnectorsPage } from "@/pages/ConnectorsPage";
import { BrowserUsePage } from "@/pages/personal/BrowserUsePage";
import { FlowsPage } from "@/pages/personal/FlowsPage";
import { WhatsAppPage } from "@/pages/personal/WhatsAppPage";
import { AppShell } from "@/components/shell/AppShell";
import { TodayPage } from "@/pages/personal/TodayPage";
import { MyProfilePage } from "@/pages/personal/MyProfilePage";
import { FamilyPage } from "@/pages/personal/FamilyPage";
import { FriendsPage } from "@/pages/personal/FriendsPage";
import { WorkPeoplePage } from "@/pages/personal/WorkPeoplePage";
import { ImportantPeoplePage } from "@/pages/personal/ImportantPeoplePage";
import { LifeTimelinePage } from "@/pages/personal/LifeTimelinePage";
import { ImportantDatesPage } from "@/pages/personal/ImportantDatesPage";
import { AssistantPersonalityPage } from "@/pages/personal/AssistantPersonalityPage";
import { AssistantToneLanguagePage } from "@/pages/personal/AssistantToneLanguagePage";
import { AssistantResponseStylePage } from "@/pages/personal/AssistantResponseStylePage";
import { AssistantVoicePage } from "@/pages/personal/AssistantVoicePage";
import { AssistantRulesPage } from "@/pages/personal/AssistantRulesPage";
import { AssistantPermissionsPage } from "@/pages/personal/AssistantPermissionsPage";
import { UsagePage } from "@/pages/personal/UsagePage";
import { MemoryPreferencesPage } from "@/pages/personal/MemoryPreferencesPage";
import { MemoryPeoplePage } from "@/pages/personal/MemoryPeoplePage";
import { MemoryTemporaryPage } from "@/pages/personal/MemoryTemporaryPage";
import { MemoryForgetPage } from "@/pages/personal/MemoryForgetPage";
import { MorningBriefingPage } from "@/pages/personal/MorningBriefingPage";
import { DailyNewsPage } from "@/pages/personal/DailyNewsPage";
import { RoutinesPage } from "@/pages/personal/RoutinesPage";
import { HabitsPage } from "@/pages/personal/HabitsPage";
import { TasksPage } from "@/pages/personal/TasksPage";
import { SchedulePage } from "@/pages/personal/SchedulePage";
import { PlansPage } from "@/pages/personal/PlansPage";
import { GoalsPage } from "@/pages/personal/GoalsPage";
import { FollowUpsPage } from "@/pages/personal/FollowUpsPage";
import { UpcomingPage } from "@/pages/personal/UpcomingPage";
import { EndOfDayReflectionPage } from "@/pages/personal/EndOfDayReflectionPage";
import { WeeklyReviewPage } from "@/pages/personal/WeeklyReviewPage";

/** A persisted token from a previous session only carries username/token
 * (see store/auth-store.ts) - hasProfile/assistantName/responseLanguage
 * must be re-fetched from the backend before routing, otherwise a returning
 * user with a completed profile would incorrectly get sent through
 * onboarding again on every app restart. */
function useSessionRestore() {
  const { token, login, setProfileInfo, logout } = useAuthStore();
  const [restoring, setRestoring] = useState(!!token);

  useEffect(() => {
    if (!token) {
      setRestoring(false);
      return;
    }
    (async () => {
      try {
        const me = await api.getMe(token);
        login(token, me.username, me.has_profile);
        if (me.has_profile) {
          const profile = await api.getProfile(token);
          if (profile) setProfileInfo(profile.assistant_name, profile.response_language);
        }
      } catch {
        logout(); // token expired/invalid - back to the login screen
      } finally {
        setRestoring(false);
      }
    })();
    // Only ever run once per token restoration, not on every store update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return restoring;
}

function App() {
  const { token, hasProfile } = useAuthStore();
  const restoring = useSessionRestore();

  if (restoring) {
    return <div className="h-screen w-screen bg-background" />;
  }

  return (
    <HashRouter>
      <Toaster position="bottom-right" />
      {!token ? (
        <AuthPage />
      ) : !hasProfile ? (
        <OnboardingPage />
      ) : (
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/voice" element={<VoicePage />} />
            <Route path="/today" element={<TodayPage />} />

            <Route path="/about/profile" element={<MyProfilePage />} />
            <Route path="/about/family" element={<FamilyPage />} />
            <Route path="/about/friends" element={<FriendsPage />} />
            <Route path="/about/work" element={<WorkPeoplePage />} />
            <Route path="/about/important-people" element={<ImportantPeoplePage />} />
            <Route path="/about/life" element={<LifeTimelinePage />} />
            <Route path="/about/important-dates" element={<ImportantDatesPage />} />

            <Route path="/assistant/personality" element={<AssistantPersonalityPage />} />
            <Route path="/assistant/tone-language" element={<AssistantToneLanguagePage />} />
            <Route path="/assistant/response-style" element={<AssistantResponseStylePage />} />
            <Route path="/assistant/voice" element={<AssistantVoicePage />} />
            <Route path="/assistant/rules" element={<AssistantRulesPage />} />
            <Route path="/assistant/permissions" element={<AssistantPermissionsPage />} />
            <Route path="/assistant/usage" element={<UsagePage />} />

            <Route path="/memory/memories" element={<MemoryPage />} />
            <Route path="/memory/preferences" element={<MemoryPreferencesPage />} />
            <Route path="/memory/people" element={<MemoryPeoplePage />} />
            <Route path="/memory/temporary" element={<MemoryTemporaryPage />} />
            <Route path="/memory/forget" element={<MemoryForgetPage />} />

            <Route path="/daily/tasks" element={<TasksPage />} />
            <Route path="/daily/schedule" element={<SchedulePage />} />
            <Route path="/daily/plans" element={<PlansPage />} />
            <Route path="/daily/goals" element={<GoalsPage />} />
            <Route path="/daily/morning-briefing" element={<MorningBriefingPage />} />
            <Route path="/daily/news" element={<DailyNewsPage />} />
            <Route path="/work/jobs" element={<JobsPage />} />
            <Route path="/work/flows" element={<FlowsPage />} />
            <Route path="/daily/reminders" element={<Navigate to="/work/jobs" replace />} />
            <Route path="/daily/routines" element={<RoutinesPage />} />
            <Route path="/daily/habits" element={<HabitsPage />} />
            <Route path="/daily/eod-reflection" element={<EndOfDayReflectionPage />} />
            <Route path="/daily/weekly-review" element={<WeeklyReviewPage />} />
            <Route path="/daily/follow-ups" element={<FollowUpsPage />} />
            <Route path="/daily/upcoming" element={<UpcomingPage />} />

            <Route path="/knowledge" element={<KnowledgePage />} />
            <Route path="/connections" element={<ApiConnectionsPage />} />
            <Route path="/work/connectors" element={<ConnectorsPage />} />
            <Route path="/work/browser-use" element={<BrowserUsePage />} />
            <Route path="/work/whatsapp" element={<WhatsAppPage />} />
            <Route path="/mcp" element={<McpServersPage />} />
            <Route path="*" element={<Navigate to="/today" replace />} />
          </Route>
        </Routes>
      )}
    </HashRouter>
  );
}

export default App;
