import {
  createHashRouter,
  RouterProvider,
  Outlet,
} from "react-router-dom";
import ExtractionPage from "./components/ExtractionPage";
import ResultsPage from "./components/ResultsPage";
import lioncrest_logo_horizontal from "./assets/lioncrest_logo_horizontal.png";

// Layout with shared UI
function Layout() {
  return (
    <div className="h-screen w-full flex flex-col">
      {/* Header with logo */}
      <header className="pt-6 pb-4 px-4 flex items-center gap-3">
        <img
          src={lioncrest_logo_horizontal}
          alt="Lioncrest logo"
          className="h-8 scale-125 origin-left"
        />
      </header>
      {/* Main content area */}
      <main className="flex-1 overflow-y-auto p-4">
        <Outlet />
      </main>
    </div>
  );
}

// Define routes with a parent layout
const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <ExtractionPage /> },
      { path: "/results", element: <ResultsPage /> },
    ],
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
