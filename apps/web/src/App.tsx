import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { DeviceGate } from "@/components/DeviceGate";
import { DebugPage } from "@/pages/DebugPage";
import { HomePage } from "@/pages/HomePage";
import { JoinPage } from "@/pages/JoinPage";
import {
  CityPage,
  NotFoundPage,
  PlayerPage,
  ProjectorPage,
  TeachGamePage,
  TeachPage,
} from "@/pages/RoutePages";

// Keeps three.js out of the main bundle.
const WorldPrototypePage = lazy(() =>
  import("@/pages/WorldPrototypePage").then((module) => ({
    default: module.WorldPrototypePage,
  })),
);

function App() {
  return (
    <DeviceGate>
      <BrowserRouter>
        <Routes>
          <Route path="debug/:code" element={<DebugPage />} />
          <Route
            path="prototype/world"
            element={
              <Suspense fallback={null}>
                <WorldPrototypePage />
              </Suspense>
            }
          />
          <Route element={<AppLayout />}>
            <Route index element={<HomePage />} />
            <Route path="join" element={<JoinPage />} />
            <Route path="play/:code" element={<PlayerPage />} />
            <Route path="city/:code" element={<CityPage />} />
            <Route path="projector/:code" element={<ProjectorPage />} />
            <Route path="teach" element={<TeachPage />} />
            <Route path="teach/:gameId" element={<TeachGamePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </DeviceGate>
  );
}

export default App;
