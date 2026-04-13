import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Investors from './pages/Investors';
import InvestorDetail from './pages/InvestorDetail';
import InvestorCreate from './pages/InvestorCreate';
import InvestorEdit from './pages/InvestorEdit';
import Documents from './pages/Documents';
import AIAssistant from './pages/AIAssistant';

function App() {
  const isAuthenticated = !!localStorage.getItem('token');

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/investors"
          element={isAuthenticated ? <Investors /> : <Navigate to="/login" />}
        />
        <Route
          path="/investors/new"
          element={isAuthenticated ? <InvestorCreate /> : <Navigate to="/login" />}
        />
        <Route
          path="/investor/:id"
          element={isAuthenticated ? <InvestorDetail /> : <Navigate to="/login" />}
        />
        <Route
          path="/investor/:id/edit"
          element={isAuthenticated ? <InvestorEdit /> : <Navigate to="/login" />}
        />
        <Route
          path="/documents"
          element={isAuthenticated ? <Documents /> : <Navigate to="/login" />}
        />
        <Route
          path="/ai"
          element={isAuthenticated ? <AIAssistant /> : <Navigate to="/login" />}
        />

        <Route
          path="*"
          element={
            isAuthenticated
              ? <Navigate to="/investors" replace />
              : <Navigate to="/login" replace />
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;