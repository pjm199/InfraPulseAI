import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useRef } from 'react'
import type { Mesh } from 'three'
import { MOUSE } from 'three'

type Device = {
  id: string
  hostname: string
  ip: string
  status: string
}

type Alert = {
  severity: 'info' | 'warning' | 'critical' | string
}

type Props = {
  devices: Device[]
  latestAlerts: Map<string, Alert>
  selectedDeviceId: string | null
  onSelectDevice: (id: string | null) => void
}

function deviceColor(status: string, alert?: Alert) {
  const sev = alert?.severity
  if (sev === 'critical' || status === 'critical' || status === 'down') return '#f97373'
  if (sev === 'warning' || status === 'warning') return '#fbbf24'
  if (status === 'unknown') return '#64748b'
  return '#22c55e'
}

type NodeProps = {
  position: [number, number, number]
  color: string
  isSelected: boolean
  onClick: () => void
}

function DeviceNode({ position, color, isSelected, onClick }: NodeProps) {
  const meshRef = useRef<Mesh>(null)
  const baseY = useRef(position[1])
  baseY.current = position[1]

  useFrame((_, delta) => {
    const mesh = meshRef.current
    if (!mesh) return
    mesh.position.set(position[0], baseY.current + Math.sin(Date.now() * 0.002) * 0.08, position[2])
    mesh.rotation.y += delta * 0.15
    mesh.scale.setScalar(isSelected ? 1.3 : 1)
  })

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const native = e.nativeEvent
    if (native?.stopImmediatePropagation) native.stopImmediatePropagation()
    if (native?.preventDefault) native.preventDefault()
    onClick()
  }

  return (
    <mesh
      ref={meshRef}
      position={position}
      onPointerDown={handlePointerDown}
      onPointerOver={(e) => {
        e.stopPropagation()
        e.nativeEvent?.preventDefault?.()
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={(e) => {
        e.stopPropagation()
        document.body.style.cursor = 'default'
      }}
    >
      <boxGeometry args={[0.8, 0.8, 0.8]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
    </mesh>
  )
}

function Scene({ devices, latestAlerts, selectedDeviceId, onSelectDevice }: Props) {
  // Simple grid layout
  const cols = Math.max(3, Math.ceil(Math.sqrt(devices.length || 1)))
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 5, 4]} intensity={1.2} />
      {devices.map((d, idx) => {
        const row = Math.floor(idx / cols)
        const col = idx % cols
        const spacing = 1.6
        const x = (col - cols / 2) * spacing
        const z = row * spacing * 1.2
        const y = 0
        const color = deviceColor(d.status, latestAlerts.get(d.id))
        return (
          <DeviceNode
            key={d.id}
            position={[x, y, z]}
            color={color}
            isSelected={selectedDeviceId === d.id}
            onClick={() => onSelectDevice(d.id)}
          />
        )
      })}
      {/* Left click = select node; right drag = rotate camera, middle = zoom */}
      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        rotateSpeed={1.8}
        enableDamping
        dampingFactor={0.05}
        mouseButtons={{ LEFT: undefined, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE }}
      />
    </>
  )
}

export function DigitalTwinScene(props: Props) {
  return (
    <div className="h-full w-full min-h-[200px]">
      <Canvas
        camera={{ position: [0, 4, 8], fov: 50 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
      >
        <color attach="background" args={['#020617']} />
        <Scene {...props} />
      </Canvas>
    </div>
  )
}

