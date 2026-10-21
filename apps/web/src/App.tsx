import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
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

function App() {
  return (
    <BrowserRouter>
      <Routes>
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
  );
}

export default App;
