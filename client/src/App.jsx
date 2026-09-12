import { useEffect, useState } from "react";
import api from "./services/api";

function App() {
  const [status, setStatus] = useState("Checking backend...");

  useEffect(() => {
    api.get("/health")
      .then((res) => setStatus(res.data.message))
      .catch(() => setStatus("Backend not connected"));
  }, []);

  return (
    <main style={{ fontFamily: "Arial, sans-serif", padding: 40 }}>
      <h1>AI Video Learning Generator</h1>
      <p>Phase 1 foundation is ready.</p>
      <p>Backend status: {status}</p>
    </main>
  );
}

export default App;
