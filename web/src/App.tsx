import { Suspense } from "react"
import { Loader } from "@react-three/drei"
import { Canvas } from "@react-three/fiber"

import Chat from "./components/Chat"
import Scene from "./components/Scene"

function App() {
  return (
    <>
      <Chat />
      <Canvas
        shadows
        dpr={[1, 2]}
        performance={{ min: 0.5 }}
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
