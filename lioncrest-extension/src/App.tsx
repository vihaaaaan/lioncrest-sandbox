import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import ExtractionPage from './components/ExtractionPage'
import ResultsPage from './components/ResultsPage'
import './App.css'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<ExtractionPage />} />
        <Route path="/results" element={<ResultsPage />} />
      </Routes>
    </Router>
  )
}

export default App
