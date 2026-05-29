import { Suspense } from "react"
import { Canvas } from "@react-three/fiber"

import BgmControl from "./components/BgmControl"
import Chat from "./components/Chat"
import DetailPanel from "./components/DetailPanel"
import LoadingScreen from "./components/LoadingScreen"
import Scene from "./components/Scene"
import VoiceControl from "./components/VoiceControl"

function App() {
  return (
    <>
      <div className="fixed top-4 right-3 sm:top-6 sm:right-[clamp(24px,calc(50vw-40rem),100vw)] z-50 flex flex-col items-end gap-2">
        <BgmControl />
        <VoiceControl />
      </div>
      <div className="fixed bottom-24 left-3 z-40 flex w-[calc(100vw-1.5rem)] flex-col gap-3 text-sm sm:bottom-auto sm:left-[clamp(24px,calc(50vw-40rem),100vw)] sm:top-5 sm:z-50 sm:w-72">
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
