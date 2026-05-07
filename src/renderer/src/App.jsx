import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Sidebar from '@/components/Sidebar'
import Inicio from '@/pages/Inicio'
import Pacientes from '@/pages/Pacientes'
import Alumnos from '@/pages/Alumnos'
import Grupos from '@/pages/Grupos'
import Pagos from '@/pages/Pagos'
import Reportes from '@/pages/Reportes'
import Configuracion from '@/pages/Configuracion'

function App() {
  return (
    <MemoryRouter>
      <div className="flex h-full">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-8">
          <Routes>
            <Route path="/" element={<Inicio />} />
            <Route path="/pacientes" element={<Pacientes />} />
            <Route path="/alumnos" element={<Alumnos />} />
            <Route path="/grupos" element={<Grupos />} />
            <Route path="/pagos" element={<Pagos />} />
            <Route path="/reportes" element={<Reportes />} />
            <Route path="/configuracion" element={<Configuracion />} />
          </Routes>
        </main>
      </div>
    </MemoryRouter>
  )
}

export default App
