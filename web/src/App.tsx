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
      <div className="fixed left-3 top-16 z-40 flex max-h-[calc(100dvh-12rem)] w-[calc(100vw-1.5rem)] max-w-72 flex-col gap-3 text-sm sm:left-6 sm:top-5 sm:z-50 sm:max-h-[calc(100dvh-2.5rem)] sm:w-72">
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
