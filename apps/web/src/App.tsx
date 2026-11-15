import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { DeviceGate } from "@/components/DeviceGate";
import { HomePage } from "@/pages/HomePage";
import { JoinPage } from "@/pages/JoinPage";
import { NotFoundPage } from "@/pages/NotFoundPage";

// Game screens load on demand so the home and join pages stay small; the
// socket client and game rules come with them.
const PlayPage = lazy(() =>
  import("@/pages/PlayPage").then((m) => ({ default: m.PlayPage })),
);
const TeachHomePage = lazy(() =>
  import("@/pages/TeachPages").then((m) => ({ default: m.TeachHomePage })),
);
const TeacherConsolePage = lazy(() =>
  import("@/pages/TeachPages").then((m) => ({ default: m.TeacherConsolePage })),
);
const ProjectorPage = lazy(() =>
  import("@/pages/ProjectorPage").then((m) => ({ default: m.ProjectorPage })),
);
const DebugPage = lazy(() =>
  import("@/pages/DebugPage").then((m) => ({ default: m.DebugPage })),
);
const LabPage = lazy(() =>
  import("@/pages/LabPage").then((m) => ({ default: m.LabPage })),
);

function App() {
  return (
    <DeviceGate>
      <BrowserRouter>
        <Suspense fallback={null}>
          <Routes>
            <Route path="play/:code" element={<PlayPage />} />
            {/* A team's shared device plays the same view. */}
            <Route path="city/:code" element={<PlayPage />} />
            <Route path="teach/:code" element={<TeacherConsolePage />} />
            <Route path="projector/:code" element={<ProjectorPage />} />
            <Route path="debug/:code" element={<DebugPage />} />
            {import.meta.env.DEV ? (
              <Route path="dev/lab" element={<LabPage />} />
            ) : null}
            <Route element={<AppLayout />}>
              <Route index element={<HomePage />} />
              <Route path="join" element={<JoinPage />} />
              <Route path="teach" element={<TeachHomePage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </DeviceGate>
  );
}

export default App;
