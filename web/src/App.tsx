import { Suspense } from "react"
import { Canvas } from "@react-three/fiber"

import BgmControl from "./components/BgmControl"
import Chat from "./components/Chat"
import DetailPanel from "./components/DetailPanel"
import LoadingScreen from "./components/LoadingScreen"
import Scene from "./components/Scene"
import VoiceControl from "./components/VoiceControl"
import WebSearchPanel from "./components/WebSearchPanel"

function App() {
  return (
    <>
      <div className="fixed top-4 right-3 sm:top-6 sm:right-[clamp(24px,calc(50vw-600px),100vw)] z-50 flex flex-col items-end gap-2">
        <BgmControl />
        <VoiceControl />
      </div>
      <div className="fixed left-3 top-28 z-40 flex max-h-[calc(100dvh-14rem)] w-[calc(100vw-1.5rem)] max-w-72 flex-col gap-3 text-sm sm:left-6 sm:top-5 sm:z-50 sm:max-h-[calc(100dvh-2.5rem)] sm:w-72">
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
      <LoadingScreen />
    </>
  )
}

export default App
