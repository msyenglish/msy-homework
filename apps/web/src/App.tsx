import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { useScrollMemory } from "./lib/navState";
import RequireAuth from "./components/RequireAuth";
import RequireUser from "./components/RequireUser";
import TeacherLayout from "./components/TeacherLayout";
import LoginPage from "./pages/LoginPage";
import NotFoundPage from "./pages/NotFoundPage";
import HomePage from "./pages/HomePage";
import SetupGuidePage from "./pages/SetupGuidePage";
import AboutPage from "./pages/AboutPage";
import { getBrand } from "./lib/brand";
import ReportPublicPage from "./pages/ReportPublicPage";
import SubmissionReportPage from "./pages/SubmissionReportPage";
import UserLoginPage from "./pages/user/UserLoginPage";
import UserResetPasswordPage from "./pages/user/UserResetPasswordPage";
import OnboardingPage from "./pages/user/OnboardingPage";
import UserLayout from "./pages/user/UserLayout";
import UserLibraryPage from "./pages/user/UserLibraryPage";
import UserGrammarPage from "./pages/user/UserGrammarPage";
import GrammarDrillPage from "./pages/user/GrammarDrillPage";
import GrammarTranslatePage from "./pages/user/GrammarTranslatePage";
import GrammarReportPage from "./pages/user/GrammarReportPage";
import UserVocabularyPage from "./pages/user/UserVocabularyPage";
import VocabSetDetailPage from "./pages/user/learn/VocabSetDetailPage";
import GrammarMapPage from "./pages/user/learn/GrammarMapPage";
import UserPracticePage from "./pages/user/UserPracticePage";
import VideoPracticePage from "./pages/user/VideoPracticePage";
import VideoReportPage from "./pages/user/VideoReportPage";
import UserProfilePage from "./pages/user/UserProfilePage";
import UserProgressPage from "./pages/user/UserProgressPage";
import UserReportsPage from "./pages/user/UserReportsPage";
import UserReportDetailPage from "./pages/user/UserReportDetailPage";
import ExercisesPage from "./pages/teacher/ExercisesPage";
import ExerciseEditorPage from "./pages/teacher/ExerciseEditorPage";
import ExercisePreviewPage from "./pages/teacher/ExercisePreviewPage";
import StudentsPage from "./pages/teacher/StudentsPage";
import StudentDetailPage from "./pages/teacher/StudentDetailPage";
import SubmissionReviewPage from "./pages/teacher/SubmissionReviewPage";
import ReportsPage from "./pages/teacher/ReportsPage";
import TeacherPathsPage from "./pages/teacher/TeacherPathsPage";
import TeacherVocabPage from "./pages/teacher/TeacherVocabPage";
import TeacherGrammarPage from "./pages/teacher/TeacherGrammarPage";
import TeacherTextsPage from "./pages/teacher/TeacherTextsPage";
import TeacherGuidePage from "./pages/teacher/TeacherGuidePage";
import AiGatewayPage from "./pages/teacher/AiGatewayPage";
import UserLeaderboardPage from "./pages/user/UserLeaderboardPage";

export default function App() {
  // Back/Forward lands where the page was left, not at the top (see lib/navState.ts).
  useScrollMemory();
  return (
    <Routes>
      {/* Home → the learner sign-in screen */}
      {/* "/" is the home page unless the teacher turned it off (Settings → Branding). */}
      <Route path="/" element={getBrand().homePage ? <HomePage /> : <Navigate to="/u/login" replace />} />
      <Route path="/home" element={<HomePage />} />
      {/* Public install guide (docs/SETUP.md) — for anyone who wants their own copy. */}
      <Route path="/setup" element={<SetupGuidePage />} />
      <Route path="/about" element={<AboutPage />} />
      {/* The OLD student area (`students` table) is retired
          The redirect stays because /practice/<slug> links were already handed to parents;
          learners sign in and open the exercise from their library. */}
      <Route path="/student/*" element={<Navigate to="/u/login" replace />} />
      <Route path="/practice/:exerciseId" element={<Navigate to="/u/login" replace />} />
      <Route path="/r/:id" element={<ReportPublicPage />} />
      <Route path="/s/:id" element={<SubmissionReportPage />} />

      {/* User công khai (tự đăng ký) */}
      <Route path="/u" element={<Navigate to="/u/library" replace />} />
      <Route path="/u/login" element={<UserLoginPage />} />
      <Route path="/u/reset-password" element={<UserResetPasswordPage />} />
      <Route
        path="/u/onboarding"
        element={
          <RequireUser>
            <OnboardingPage />
          </RequireUser>
        }
      />
      {/* Grammar drill runs on its own page and reuses the exercise Quiz UI.
          The optional :draftId reopens an unfinished session. */}
      <Route
        path="/u/grammar/practice"
        element={
          <RequireUser>
            <GrammarDrillPage />
          </RequireUser>
        }
      />
      <Route
        path="/u/grammar/practice/:draftId"
        element={
          <RequireUser>
            <GrammarDrillPage />
          </RequireUser>
        }
      />
      {/* Translation drill: Vietnamese prompt -> English sentence. */}
      <Route
        path="/u/grammar/translate"
        element={
          <RequireUser>
            <GrammarTranslatePage />
          </RequireUser>
        }
      />
      <Route
        path="/u/grammar/translate/:draftId"
        element={
          <RequireUser>
            <GrammarTranslatePage />
          </RequireUser>
        }
      />
      <Route
        path="/u/practice/:exerciseId"
        element={
          <RequireUser>
            <UserPracticePage />
          </RequireUser>
        }
      />
      <Route
        path="/u/video/:slug"
        element={
          <RequireUser>
            <VideoPracticePage />
          </RequireUser>
        }
      />
      <Route
        path="/u/video/:slug/report"
        element={
          <RequireUser>
            <VideoReportPage />
          </RequireUser>
        }
      />
      <Route
        path="/u"
        element={
          <RequireUser>
            <UserLayout />
          </RequireUser>
        }
      >
        <Route path="library" element={<UserLibraryPage />} />
        <Route path="grammar" element={<UserGrammarPage />} />
        {/* Inside the layout on purpose: a report is a reading page and needs the nav. */}
        <Route path="grammar/report/:id" element={<GrammarReportPage />} />
        <Route path="vocabulary" element={<UserVocabularyPage />} />
        <Route path="vocabulary/set/:slug" element={<VocabSetDetailPage />} />
        <Route path="grammar/map" element={<GrammarMapPage />} />
        <Route path="learn" element={<Navigate to="/u/grammar" replace />} />
        <Route path="leaderboard" element={<UserLeaderboardPage />} />
        <Route path="progress" element={<UserProgressPage />} />
        <Route path="reports" element={<UserReportsPage />} />
        <Route path="reports/:month" element={<UserReportDetailPage />} />
        <Route path="account" element={<UserProfilePage />} />
      </Route>

      {/* Giáo viên */}
      <Route path="/teacher/login" element={<LoginPage />} />
      {/* Chữa bài đầy đủ (mở tab mới) — ngoài layout để tập trung */}
      <Route
        path="/teacher/submissions/:submissionId"
        element={
          <RequireAuth>
            <SubmissionReviewPage />
          </RequireAuth>
        }
      />
      {/* Xem thử — ĐỨNG NGOÀI TeacherLayout: phải giống hệt màn học sinh (bài đọc to chiếm
          trọn 100dvh, nav của cô sẽ phá layout). Vẫn yêu cầu đăng nhập giáo viên. */}
      <Route
        path="/teacher/exercises/:slug/preview"
        element={
          <RequireAuth>
            <ExercisePreviewPage />
          </RequireAuth>
        }
      />
      <Route
        path="/teacher"
        element={
          <RequireAuth>
            <TeacherLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="students" replace />} />
        <Route path="students" element={<StudentsPage />} />
        {/* Classes live in a drawer on the learners page — keep old links working. */}
        <Route path="classes" element={<Navigate to="/teacher/students" replace />} />
        {/* Students and users are one list now — keep old links working. */}
        <Route path="users" element={<Navigate to="/teacher/students" replace />} />
        <Route path="users/:id" element={<UserToStudentRedirect />} />
        {/* Grammar/Vocab/Leaderboard: gỡ trang quản trị — AI thao tác data trực tiếp; BXH xem ở /u/leaderboard (public). Redirect link cũ. */}
        <Route path="grammar" element={<TeacherGrammarPage />} />
        <Route path="texts" element={<TeacherTextsPage />} />
        <Route path="guide" element={<TeacherGuidePage />} />
        <Route path="guide/:slug" element={<TeacherGuidePage />} />
        <Route path="vocab" element={<TeacherVocabPage />} />
        <Route path="leaderboard" element={<Navigate to="/u/leaderboard" replace />} />
        <Route path="students/:id" element={<StudentDetailPage />} />
        <Route path="exercises" element={<ExercisesPage />} />
        <Route path="exercises/new" element={<ExerciseEditorPage />} />
        {/* Trình soạn video/audio theo câu ĐÃ GỘP vào editor thống nhất — giữ redirect cho link cũ. */}
        <Route path="exercises/video/new" element={<Navigate to="/teacher/exercises/new?mode=custom" replace />} />
        <Route path="exercises/:slug/video" element={<ExerciseEditorPage />} />
        <Route path="exercises/:slug/edit" element={<ExerciseEditorPage />} />
        <Route path="paths" element={<TeacherPathsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="ai" element={<AiGatewayPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

/** /teacher/users/:id → /teacher/students/:id (one learner page for every account). */
function UserToStudentRedirect() {
  const { id } = useParams();
  return <Navigate to={`/teacher/students/${id ?? ""}`} replace />;
}
