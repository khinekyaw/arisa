import { Suspense } from "react"
import { Loader } from "@react-three/drei"
import { Canvas } from "@react-three/fiber"

import BgmControl from "./components/BgmControl"
import Chat from "./components/Chat"
import DetailPanel from "./components/DetailPanel"
import Scene from "./components/Scene"
import WebSearchPanel from "./components/WebSearchPanel"

function App() {
  return (
    <>
      <BgmControl />
      <div className="fixed left-6 top-5 z-50 flex max-h-[calc(100vh-2.5rem)] w-72 flex-col gap-3 text-sm">
        <WebSearchPanel />
        <DetailPanel />
      </div>
      <Chat />
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 0.5, 3.2], fov: 20 }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
      <Loader />
    </>
  )
}

export default App
