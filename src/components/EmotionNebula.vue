<script setup>
/*
 * 情绪卡片星云（Soul Nebula）
 * 基础：D:\ALINDA\static\情绪卡片星云2.html（Three.js + MediaPipe Hands）
 * 改造点：
 *  1. 收进 Vue 组件作用域，不再劫持 document.body（cursor / class / transform 全部局部化）
 *  2. 输入层抽象为统一的 input 状态：手势模式（摄像头 + 手掌）与触摸模式（手指）共用同一套渲染逻辑
 *  3. 摄像头授权失败/未开启时自动降级为触摸，页面不会卡在"等待摄像头"
 *  4. 文案库持久化到 localStorage，两人可自定义专属情话
 */
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { theme } from '../theme'
import { vibrate } from '../utils/image'

const emit = defineEmits(['close'])
const themeClass = computed(() => (theme.value === 'male' ? 'theme-male' : 'theme-female'))

// ---- UI 状态 ----
const stageRef = ref(null)
const videoRef = ref(null)
const showEditor = ref(false)
const immersive = ref(false)
const gestureOn = ref(false)
const statusText = ref('触摸卡片即可阅读')
const statusState = ref('idle') // idle | active | cooldown | warn
const progress = ref(0)
const bgmName = ref('')
const shakeStyle = ref({})

// ---- 文案库（默认值取自原文件，可被 localStorage 覆盖） ----
const DEFAULT_MESSAGES = [
  '我不李姐', '我很李姐', '潮汕人吗', '你到底是',
  '别熬夜了', '保持好心情', '未来可期', '记得吃饭',
  '抱抱你呀', '永远开心', '万事胜意', '王树别叫',
  '记得睡觉', '记得别叫', '慢慢来', '愿君与伴',
  '生活明朗', '万物可爱', '平安喜乐', '自在如风',
  '保持热爱', '奔赴山海', '来日方长', '愿君相随',
  '天天开心', '元气满满', '与君相伴', '这应该的',
  '见信如晤', '岁岁平安', '光芒万丈', '随遇而安',
  '不负韶华', '只争朝夕', '陌上花开', '缓缓而来',
  '心之所向', '素履以往', '生如夏花', '静待花开',
]
const DEFAULT_SUBS = [
  '王老师，你专注做实验的样子就很祝。',
  '好聪明啊，学长，谢谢应该的',
  '长大了哇，怎么这么大了',
  '哇，你怎么这么瘦了',
  '生活原本沉闷，但猪跑起来就有风。',
  '长大了，王树',
  '长小了，王树',
  '别这样说，越来越瘦了',
  '吃南门快餐去。',
  '凡是过往皆为序章，凡是未来皆有可期。',
  '吃鸡公煲咯',
  '王树，别叫',
]
const MSG_KEY = 'nebula_messages'
const SUB_KEY = 'nebula_sub_messages'
const readLines = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return [...fallback]
    const lines = JSON.parse(raw)
    return Array.isArray(lines) && lines.length ? lines : [...fallback]
  } catch (e) {
    return [...fallback]
  }
}
let MESSAGES = readLines(MSG_KEY, DEFAULT_MESSAGES)
let SUB_MESSAGES = readLines(SUB_KEY, DEFAULT_SUBS)
const draftMain = ref(MESSAGES.join('\n'))
const draftSub = ref(SUB_MESSAGES.join('\n'))

// ---- 配色（原样保留） ----
const PALETTES = [
  { bg: ['#24243e', '#302b63', '#0f0c29'], border: '#a18cd1', particle: [0xa18cd1, 0x302b63] },
  { bg: ['#134e5e', '#71b280'], border: '#71b280', particle: [0x71b280, 0x134e5e] },
  { bg: ['#ff9966', '#ff5e62'], border: '#ff9966', particle: [0xff9966, 0xff5e62] },
  { bg: ['#000428', '#004e92'], border: '#004e92', particle: [0x004e92, 0x00c6ff] },
  { bg: ['#833ab4', '#fd1d1d', '#fcb045'], border: '#fcb045', particle: [0xfcb045, 0xfd1d1d] },
  { bg: ['#2C3E50', '#4CA1AF'], border: '#4CA1AF', particle: [0x4CA1AF, 0xBDC3C7] },
  { bg: ['#4568DC', '#B06AB3'], border: '#B06AB3', particle: [0xB06AB3, 0x4568DC] },
]

// ---- 全局参数 ----
const params = {
  count: 300,
  radiusBase: 40,
  radiusVariation: 15,
  cardBaseSize: 1.0,
  floatSpeed: 0.4,
  rotationSpeed: 0.012,
  zoomScale: 6.5,
  pinchThreshold: 0.6,
  dissolveTime: 2.2,
  cooldownTime: 1600,
  bloomStrength: 0.7,
  bloomRadius: 0.8,
  bloomThreshold: 0.15,
}

/**
 * 统一输入层：手势与触摸都只写这一个对象，animate() 只读它
 * source: 'none' 自动巡游 | 'hand' 手势 | 'pointer' 手指
 */
const input = {
  source: 'none',
  lon: 0,
  lat: 0,
  radius: 85,
  ndc: { x: 0, y: 0 },
  pinch: 0,
}

// ---- three 运行时（非响应式，避免 Proxy 拖慢逐帧计算） ----
let renderer, scene, camera, composer, bloomPass, particles, particleTexture
let popupGroup, popups = [], explosions = []
let clock, raycaster, rafId = null, ro = null
let cooldownEnd = 0, lastHover = null
const camCurrent = { lon: 0, lat: 0, radius: 100 }

// ---- 音频：合成音效 + 本地 BGM ----
let audioCtx = null
let bgm = null
function playSound(type) {
  if (!audioCtx) return
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.connect(gain)
  gain.connect(audioCtx.destination)
  const now = audioCtx.currentTime
  if (type === 'hover') {
    osc.type = 'sine'
    osc.frequency.setValueAtTime(800, now)
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1)
    gain.gain.setValueAtTime(0.05, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1)
    osc.start(now)
    osc.stop(now + 0.1)
  } else if (type === 'explode') {
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(100, now)
    osc.frequency.exponentialRampToValueAtTime(10, now + 0.5)
    gain.gain.setValueAtTime(0.28, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8)
    osc.start(now)
    osc.stop(now + 0.8)
  }
}

// ---- 卡片贴图 ----
function drawRoundRect(ctx, x, y, w, h, r) {
  if (w < 2 * r) r = w / 2
  if (h < 2 * r) r = h / 2
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function createTexture(text, subText, paletteIndex) {
  const canvas = document.createElement('canvas')
  const w = 512
  const h = subText ? 350 : 256
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  const style = PALETTES[paletteIndex % PALETTES.length]

  const grad = ctx.createLinearGradient(0, 0, w, h)
  if (style.bg.length === 3) {
    grad.addColorStop(0, style.bg[0])
    grad.addColorStop(0.5, style.bg[1])
    grad.addColorStop(1, style.bg[2])
  } else {
    grad.addColorStop(0, style.bg[0])
    grad.addColorStop(1, style.bg[1])
  }
  drawRoundRect(ctx, 0, 0, w, h, 24)
  ctx.fillStyle = grad
  ctx.globalAlpha = 0.8
  ctx.fill()

  ctx.globalAlpha = 1
  ctx.lineWidth = 6
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'
  ctx.stroke()
  ctx.lineWidth = 2
  ctx.strokeStyle = style.border
  ctx.globalAlpha = 0.5
  ctx.stroke()
  ctx.globalAlpha = 1

  ctx.fillStyle = style.bg[0]
  ctx.beginPath()
  ctx.arc(40, 40, 8, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = style.border
  ctx.beginPath()
  ctx.arc(70, 40, 8, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = style.bg[style.bg.length - 1]
  ctx.beginPath()
  ctx.arc(100, 40, 8, 0, Math.PI * 2)
  ctx.fill()

  ctx.shadowColor = 'rgba(0,0,0,0.6)'
  ctx.shadowBlur = 12
  ctx.shadowOffsetY = 5
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const mainTextY = subText ? h / 2 - 35 : h / 2 + 5
  ctx.font = "bold 72px 'Microsoft YaHei', 'PingFang SC', sans-serif"
  ctx.fillStyle = '#ffffff'
  ctx.fillText(text, w / 2, mainTextY)

  if (subText) {
    ctx.font = "normal 26px 'Microsoft YaHei', 'PingFang SC', sans-serif"
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
    ctx.shadowBlur = 0
    const maxWidth = w - 70
    const chars = subText.split('')
    let line = ''
    let y = mainTextY + 75
    for (let n = 0; n < chars.length; n++) {
      const testLine = line + chars[n]
      if (ctx.measureText(testLine).width > maxWidth && n > 0) {
        ctx.fillText(line, w / 2, y)
        line = chars[n]
        y += 38
      } else {
        line = testLine
      }
    }
    ctx.fillText(line, w / 2, y)
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// ---- 星云布局（斐波那契球 + 波浪扰动） ----
function initPopups() {
  if (!popupGroup) return
  popupGroup.clear()
  popups.forEach((m) => m.material.map?.dispose())
  popups.length = 0

  const geometry = new THREE.PlaneGeometry(3.6, 1.8)
  const phiStep = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < params.count; i++) {
    let yBase = 1 - (i / (params.count - 1)) * 2
    yBase = Math.max(-1, Math.min(1, yBase))
    const radiusAtY = Math.sqrt(1 - yBase * yBase)
    const theta = phiStep * i
    const x = Math.cos(theta) * radiusAtY
    const y = yBase
    const z = Math.sin(theta) * radiusAtY
    const phi = Math.acos(yBase)
    const wave = Math.sin(phi * 5 + theta * 3) * 0.25 + Math.cos(theta * 2) * 0.15
    const finalRadius = params.radiusBase + (Math.random() - 0.5) * params.radiusVariation + wave * 12
    const pos = new THREE.Vector3(x, y, z).normalize().multiplyScalar(finalRadius)

    const msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)]
    const subMsg = SUB_MESSAGES[Math.floor(Math.random() * SUB_MESSAGES.length)]
    const paletteId = Math.floor(Math.random() * PALETTES.length)
    const tex = createTexture(msg, null, paletteId)
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false, color: 0xffffff })
    )
    mesh.position.copy(pos)
    mesh.userData = {
      basePos: pos.clone(),
      randomScaleFactor: 0.8 + Math.random() * 0.4,
      phase: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random() * 0.7,
      text: msg,
      subText: subMsg,
      paletteId,
      originalTex: tex,
      detailedTex: null,
      isReadingMode: false,
      holdStartTime: 0,
      isDissolving: false,
      isDissolved: false,
    }
    mesh.scale.setScalar(0)
    popupGroup.add(mesh)
    popups.push(mesh)
  }
}

function createParticleTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255, 255, 255, 1)')
  g.addColorStop(0.2, 'rgba(240, 240, 255, 0.8)')
  g.addColorStop(0.5, 'rgba(128, 128, 255, 0.2)')
  g.addColorStop(1, 'rgba(0, 0, 64, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(canvas)
}

function initParticles() {
  const n = 2600
  const geo = new THREE.BufferGeometry()
  const pos = [], colors = [], colorObj = new THREE.Color()
  for (let i = 0; i < n; i++) {
    const r = (params.radiusBase + 20) * Math.pow(Math.random(), 0.4)
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const spiralMod = Math.sin(theta * 3) * 10
    pos.push(
      (r + spiralMod) * Math.sin(phi) * Math.cos(theta),
      (r + spiralMod) * Math.sin(phi) * Math.sin(theta),
      (r + spiralMod) * Math.cos(phi)
    )
    const palette = PALETTES[Math.floor(Math.random() * PALETTES.length)]
    colorObj.setHex(palette.particle[Math.floor(Math.random() * palette.particle.length)])
    colorObj.multiplyScalar(0.8 + Math.random() * 0.4)
    colors.push(colorObj.r, colorObj.g, colorObj.b)
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  particles = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      size: 1.0, map: particleTexture, vertexColors: true, transparent: true,
      opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    })
  )
  scene.add(particles)
}

// ---- 卡片爆炸 ----
function createExplosion(position, paletteId) {
  playSound('explode')
  vibrate(60)
  const n = 700
  const geo = new THREE.BufferGeometry()
  const positions = [], colors = [], velocities = []
  const palette = PALETTES[paletteId % PALETTES.length]
  const colorObj = new THREE.Color()
  for (let i = 0; i < n; i++) {
    positions.push(
      position.x + (Math.random() - 0.5) * 15,
      position.y + (Math.random() - 0.5) * 10,
      position.z + (Math.random() - 0.5) * 2
    )
    colorObj.setHex(palette.particle[Math.floor(Math.random() * palette.particle.length)])
    colorObj.multiplyScalar(1.5)
    colors.push(colorObj.r, colorObj.g, colorObj.b)
    const angle = Math.random() * Math.PI * 2
    const speed = 0.2 + Math.random() * 0.8
    velocities.push(Math.cos(angle) * speed, Math.sin(angle) * speed + 0.3, (Math.random() - 0.5) * speed)
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      size: 1.0, map: particleTexture, vertexColors: true, transparent: true,
      opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    })
  )
  scene.add(points)
  explosions.push({ mesh: points, velocities, age: 0, maxAge: 3.0 })
}

function updateExplosions(dt) {
  for (let i = explosions.length - 1; i >= 0; i--) {
    const exp = explosions[i]
    exp.age += dt
    if (exp.age >= exp.maxAge) {
      scene.remove(exp.mesh)
      exp.mesh.geometry.dispose()
      exp.mesh.material.dispose()
      explosions.splice(i, 1)
      continue
    }
    const arr = exp.mesh.geometry.attributes.position.array
    const count = arr.length / 3
    const k = 1 - exp.age / exp.maxAge
    exp.mesh.material.opacity = k
    exp.mesh.material.size = Math.max(0, k)
    for (let j = 0; j < count; j++) {
      const idx = j * 3
      for (let a = 0; a < 3; a++) {
        exp.velocities[idx + a] *= 0.95
        arr[idx + a] += exp.velocities[idx + a]
      }
    }
    exp.mesh.geometry.attributes.position.needsUpdate = true
  }
}

// ---- 尺寸 ----
function stageSize() {
  const el = stageRef.value
  return [Math.max(1, el?.clientWidth || 1), Math.max(1, el?.clientHeight || 1)]
}
function resize() {
  const [w, h] = stageSize()
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
  composer.setSize(w, h)
}

function init() {
  const [w, h] = stageSize()
  scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(0x02020a, 0.006)
  camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000)
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setSize(w, h)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  stageRef.value.appendChild(renderer.domElement)

  composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 1.5, 0.4, 0.85)
  bloomPass.threshold = params.bloomThreshold
  bloomPass.strength = params.bloomStrength
  bloomPass.radius = params.bloomRadius
  composer.addPass(bloomPass)

  clock = new THREE.Clock()
  raycaster = new THREE.Raycaster()
  particleTexture = createParticleTexture()
  popupGroup = new THREE.Group()
  scene.add(popupGroup)
  initParticles()
  initPopups()

  ro = new ResizeObserver(resize)
  ro.observe(stageRef.value)
  animate()
}

// ---- 主循环 ----
function animate() {
  rafId = requestAnimationFrame(animate)
  const time = clock.getElapsedTime()
  const dt = Math.min(0.05, clock.getDelta())
  const nowMs = Date.now()

  if (bloomPass) {
    bloomPass.strength = params.bloomStrength
    bloomPass.radius = params.bloomRadius
    bloomPass.threshold = params.bloomThreshold
  }

  const cooling = nowMs < cooldownEnd
  if (cooling) {
    statusText.value = '星云能量重组中…'
    statusState.value = 'cooldown'
  } else if (input.source === 'hand') {
    statusText.value = '手势已链接'
    statusState.value = 'active'
  } else if (input.pinch > 0) {
    statusState.value = 'active'
  } else {
    statusText.value = '拖动旋转 · 按住卡片阅读'
    statusState.value = 'idle'
  }

  // 相机目标：首次进入自动巡游，之后保留用户视角，空闲时缓慢自转
  if (input.source === 'none') {
    input.lon = time * 0.05
    input.lat = Math.sin(time * 0.1) * 0.2
    input.radius = 85
  } else if (!cooling && input.pinch === 0 && nowMs - lastInteractMs > 6000) {
    input.lon += 0.0012
  }
  camCurrent.lon += (input.lon - camCurrent.lon) * 0.05
  camCurrent.lat += (input.lat - camCurrent.lat) * 0.05
  camCurrent.radius += (input.radius - camCurrent.radius) * 0.1
  const cx = camCurrent.radius * Math.cos(camCurrent.lat) * Math.sin(camCurrent.lon)
  const cy = camCurrent.radius * Math.sin(camCurrent.lat)
  const cz = camCurrent.radius * Math.cos(camCurrent.lat) * Math.cos(camCurrent.lon)
  camera.position.set(isNaN(cx) ? 0 : cx, isNaN(cy) ? 0 : cy, isNaN(cz) ? 85 : cz)
  camera.lookAt(0, 0, 0)

  // 拾取
  let hover = null
  if (input.source !== 'none' && !cooling) {
    raycaster.setFromCamera(new THREE.Vector2(input.ndc.x, input.ndc.y), camera)
    const hits = raycaster.intersectObjects(popups.filter((p) => !p.userData.isDissolved && !p.userData.isDissolving))
    if (hits.length) hover = hits[0].object
  }
  if (hover && hover !== lastHover) playSound('hover')
  lastHover = hover

  const reading = hover && input.pinch > params.pinchThreshold && !cooling
  let readingAny = false

  popups.forEach((mesh) => {
    const data = mesh.userData

    if (data.isDissolved) {
      if (mesh.material.opacity <= 0.05) {
        data.isDissolving = false
        data.isDissolved = false
        data.isReadingMode = false
        data.holdStartTime = 0
        mesh.scale.setScalar(0)
        mesh.material.opacity = 0
        mesh.material.map = data.originalTex
        mesh.material.color.setHex(0xffffff)
      } else {
        mesh.material.opacity *= 0.9
      }
      return
    }
    if (data.isDissolving) {
      mesh.scale.multiplyScalar(1.05)
      mesh.material.opacity -= 0.05
      mesh.material.color.lerp(new THREE.Color(0x000000), 0.1)
      if (mesh.material.opacity <= 0) data.isDissolved = true
      return
    }

    const isTarget = hover === mesh
    const threshold = data.isReadingMode ? params.pinchThreshold * 0.7 : params.pinchThreshold
    const shouldRead = isTarget && input.pinch > threshold && !cooling

    let targetScale = data.randomScaleFactor * params.cardBaseSize
    let targetScaleY = targetScale
    let targetOpacity = 0.85

    if (shouldRead) {
      data.isReadingMode = true
      readingAny = true
      if (data.holdStartTime === 0) data.holdStartTime = time
      const held = time - data.holdStartTime
      const total = params.dissolveTime
      progress.value = Math.min(1, held / total)
      const warning = total * 0.66

      let shake = new THREE.Vector3(0, 0, 0)
      let shakeRot = 0
      let glitch = 0
      if (held > warning && held < total) {
        statusText.value = '能量过载警告…'
        statusState.value = 'warn'
        const inst = (held - warning) / (total - warning)
        const amp = 0.8 * Math.pow(inst, 3)
        shake.set((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp)
        shakeRot = (Math.random() - 0.5) * 0.3 * Math.pow(inst, 2)
        glitch = Math.sin(time * 50) * 0.2 * inst
        mesh.material.color.setHex(Math.sin(time * 30) > 0 ? 0xaaffff : 0xffffff)
        targetOpacity = 1
      } else if (held < warning) {
        statusText.value = '正在读取…'
        statusState.value = 'active'
        mesh.material.color.setHex(0xffffff)
      }

      if (held >= total) {
        data.isDissolving = true
        cooldownEnd = Date.now() + params.cooldownTime
        statusText.value = '能量释放！'
        progress.value = 0
        const wp = new THREE.Vector3()
        mesh.getWorldPosition(wp)
        createExplosion(wp, data.paletteId)
        shakeStyle.value = { transform: 'scale(1.02)' }
        setTimeout(() => (shakeStyle.value = {}), 100)
        return
      }

      targetScale = params.zoomScale + glitch
      if (!data.detailedTex) data.detailedTex = createTexture(data.text, data.subText, data.paletteId)
      if (mesh.material.map !== data.detailedTex) mesh.material.map = data.detailedTex
      targetScaleY = targetScale * (350 / 256)

      const camDir = new THREE.Vector3()
      camera.getWorldDirection(camDir)
      const targetWorld = camera.position.clone().add(camDir.multiplyScalar(25)).add(shake)
      mesh.position.lerp(mesh.parent.worldToLocal(targetWorld), 0.15)
      const targetQuat = camera.quaternion.clone()
      const shakeQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), shakeRot)
      targetQuat.multiply(shakeQ)
      const parentQ = new THREE.Quaternion()
      mesh.parent.getWorldQuaternion(parentQ)
      mesh.quaternion.slerp(parentQ.invert().multiply(targetQuat), 0.15)
    } else {
      data.isReadingMode = false
      data.holdStartTime = 0
      if (mesh.material.map !== data.originalTex) mesh.material.map = data.originalTex
      mesh.material.color.setHex(0xffffff)
      const fx = Math.cos(time * data.speed + data.phase) * 0.3 * params.floatSpeed
      const fy = Math.sin(time * data.speed + data.phase) * 0.5 * params.floatSpeed
      const fz = Math.sin(time * data.speed * 0.8 + data.phase) * 0.3 * params.floatSpeed
      mesh.position.lerp(data.basePos.clone().add(new THREE.Vector3(fx, fy, fz)), 0.1)
      mesh.lookAt(camera.position)
    }

    mesh.scale.lerp(new THREE.Vector3(targetScale, targetScaleY, 1), 0.1)
    mesh.material.opacity += (targetOpacity - mesh.material.opacity) * 0.1
  })

  if (!readingAny) progress.value = 0
  if (particles) {
    particles.rotation.y = time * 0.02
    particles.rotation.x = Math.sin(time * 0.01) * 0.1
  }
  popupGroup.rotation.y = -time * params.rotationSpeed
  updateExplosions(dt)
  composer.render()
}

// ---- 触摸交互（默认通道，永远可用）----
let pointerDown = false, dragging = false
let startX = 0, startY = 0, baseLon = 0, baseLat = 0, lastInteractMs = Date.now()

function toNdc(e) {
  const rect = stageRef.value.getBoundingClientRect()
  return { x: ((e.clientX - rect.left) / rect.width) * 2 - 1, y: -((e.clientY - rect.top) / rect.height) * 2 + 1 }
}
function touch() {
  lastInteractMs = Date.now()
  input.source = 'pointer'
}
function onPointerDown(e) {
  if (gestureOn.value) return
  pointerDown = true
  dragging = false
  startX = e.clientX
  startY = e.clientY
  baseLon = input.lon
  baseLat = input.lat
  touch()
  input.ndc = toNdc(e)
  input.pinch = 1 // 先按“阅读”处理，若后续变成拖动再取消
}
function onPointerMove(e) {
  if (!pointerDown || gestureOn.value) return
  const dx = e.clientX - startX
  const dy = e.clientY - startY
  if (!dragging && Math.hypot(dx, dy) > 12) dragging = true // 12px 迟滞，区分点按与拖动
  touch()
  if (dragging) {
    input.lon = baseLon - dx * 0.006
    input.lat = Math.max(-1.2, Math.min(1.2, baseLat + dy * 0.005))
    input.pinch = 0
  } else {
    input.ndc = toNdc(e)
  }
}
function endPointer() {
  if (gestureOn.value) return
  pointerDown = false
  dragging = false
  input.pinch = 0
}
function onWheel(e) {
  if (gestureOn.value) return
  touch()
  input.radius = Math.max(25, Math.min(160, input.radius + e.deltaY * 0.08))
}

// ---- 手势通道：MediaPipe（CDN 动态注入，只在开启时加载） ----
let hands = null, mpCamera = null, handSizeSmooth = 0
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if ([...document.scripts].some((s) => s.src === src)) return resolve()
    const el = document.createElement('script')
    el.src = src
    el.crossOrigin = 'anonymous'
    el.onload = resolve
    el.onerror = () => reject(new Error('load failed: ' + src))
    document.head.appendChild(el)
  })
}

async function startGesture() {
  if (gestureOn.value) return stopGesture()
  statusText.value = '正在申请摄像头…'
  try {
    await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js')
    await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js')
    const Hands = window.Hands
    hands = new Hands({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` })
    hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.5 })
    hands.onResults((results) => {
      const lms = results.multiHandLandmarks?.[0]
      if (!lms) {
        if (input.source === 'hand') {
          input.source = 'none'
          input.pinch = 0
        }
        return
      }
      const wrist = lms[0], thumb = lms[4], index = lms[8], midMcp = lms[9]
      input.source = 'hand'
      input.ndc = { x: (1 - index.x) * 2 - 1, y: -(index.y * 2 - 1) }
      input.lon = ((1 - wrist.x) * 2 - 1) * 2.5
      input.lat = -(wrist.y * 2 - 1) * 1.8
      const size = Math.hypot(midMcp.x - wrist.x, midMcp.y - wrist.y)
      handSizeSmooth += (size - handSizeSmooth) * 0.1
      input.radius = Math.max(25, Math.min(160, 85 - (handSizeSmooth - 0.15) * 300))
      const pinchDist = Math.hypot(thumb.x - index.x, thumb.y - index.y)
      const raw = Math.max(0, Math.min(1, (0.15 - pinchDist) / 0.12))
      input.pinch += (raw - input.pinch) * 0.2
    })
    mpCamera = new window.Camera(videoRef.value, {
      onFrame: async () => {
        if (hands && gestureOn.value) await hands.send({ image: videoRef.value })
      },
      width: 640,
      height: 480,
    })
    await mpCamera.start()
    gestureOn.value = true
    statusText.value = '手势已链接'
  } catch (err) {
    await stopGesture()
    statusText.value = '摄像头不可用，已用触摸模式'
    statusState.value = 'idle'
  }
}

async function stopGesture() {
  gestureOn.value = false
  input.source = 'none'
  input.pinch = 0
  try {
    mpCamera?.stop?.()
    const stream = videoRef.value?.srcObject
    stream?.getTracks?.().forEach((t) => t.stop())
    if (videoRef.value) videoRef.value.srcObject = null
  } catch (e) { /* 忽略 */ }
  hands?.close?.()
  hands = null
  mpCamera = null
}

// ---- 文案编辑 ----
function saveText() {
  const main = draftMain.value.split('\n').map((t) => t.trim()).filter(Boolean)
  const subs = draftSub.value.split('\n').map((t) => t.trim()).filter(Boolean)
  if (!main.length) {
    statusText.value = '卡片内容不能为空'
    return
  }
  MESSAGES = main
  SUB_MESSAGES = subs.length ? subs : [...MESSAGES]
  localStorage.setItem(MSG_KEY, JSON.stringify(MESSAGES))
  localStorage.setItem(SUB_KEY, JSON.stringify(SUB_MESSAGES))
  showEditor.value = false
  initPopups()
  statusText.value = '星云已按新文案重组'
}
function resetText() {
  draftMain.value = DEFAULT_MESSAGES.join('\n')
  draftSub.value = DEFAULT_SUBS.join('\n')
}

// ---- 背景音乐 ----
function pickMusic() {
  const el = document.createElement('input')
  el.type = 'file'
  el.accept = 'audio/*'
  el.onchange = () => {
    const file = el.files?.[0]
    if (!file) return
    if (!bgm) {
      bgm = new Audio()
      bgm.loop = true
    }
    bgm.src = URL.createObjectURL(file)
    bgm.volume = 0.5
    bgm.play().then(() => {
      bgmName.value = file.name.length > 10 ? file.name.slice(0, 10) + '…' : file.name
    })
  }
  el.click()
}
function toggleBgm() {
  if (!bgm) return pickMusic()
  if (bgm.paused) {
    bgm.play()
    bgmName.value = '播放中 · ' + bgmName.value
  } else {
    bgm.pause()
  }
}

function goBack() {
  emit('close')
}

onMounted(async () => {
  await nextTick()
  init()
  // 浏览器自动播放策略：首次交互再解锁 AudioContext
  const unlock = () => {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    if (audioCtx.state === 'suspended') audioCtx.resume()
  }
  window.addEventListener('pointerdown', unlock, { once: true })
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  ro?.disconnect()
  stopGesture()
  bgm?.pause()
  bgm = null
  popups.forEach((m) => {
    m.material.map?.dispose()
    m.material.detailedTex?.dispose()
    m.material.dispose()
  })
  scene?.traverse((o) => {
    if (o.geometry) o.geometry.dispose?.()
  })
  particleTexture?.dispose()
  composer?.dispose?.()
  renderer?.dispose()
  renderer?.domElement?.remove()
})
</script>

<template>
  <div class="nebula-page" :class="themeClass">
    <!-- 3D 舞台 -->
    <div
      ref="stageRef"
      class="nebula-stage"
      :style="shakeStyle"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="endPointer"
      @pointercancel="endPointer"
      @pointerleave="endPointer"
      @wheel.prevent="onWheel"
    ></div>

    <!-- 同一个 video 既做 MediaPipe 输入源，又做手势模式下的实时小窗（镜像） -->
    <video ref="videoRef" class="nebula-video" :class="{ pip: gestureOn }" autoplay muted playsinline></video>

    <!-- 顶栏 -->
    <div class="neb-hud" :class="{ hidden: immersive }">
      <div class="hud-top">
        <span class="hud-back" @click="goBack">❮ 返回</span>
        <span class="hud-title">情绪卡片星云 🌌</span>
        <span class="hud-immersive" @click="immersive = !immersive">{{ immersive ? '显示' : '沉浸' }}</span>
      </div>

      <div class="hud-status" :class="statusState">{{ statusText }}</div>

      <div class="hud-actions">
        <button class="hud-btn" :class="{ on: gestureOn }" @click="startGesture">
          {{ gestureOn ? '关闭手势' : '开启手势 🖐' }}
        </button>
        <button class="hud-btn" @click="showEditor = true">编辑情话</button>
        <button class="hud-btn" :class="{ on: bgmName }" @click="toggleBgm">
          {{ bgmName ? '♪ ' + bgmName : '选择音乐' }}
        </button>
      </div>

      <div class="hud-hint">手掌前后移动缩放 · 捏合阅读 · 长按卡片会能量过载爆炸<br />没摄像头也可直接：拖动旋转，按住卡片阅读</div>

      <div class="hud-bar" :class="{ show: progress > 0 }">
        <div class="hud-bar-fill" :style="{ width: progress * 100 + '%' }"></div>
      </div>
    </div>

    <!-- 文案编辑器 -->
    <div v-if="showEditor" class="editor-mask" @click.self="showEditor = false">
      <div class="editor-card">
        <h3>星云文案库</h3>
        <p class="editor-tip">每行一条。卡片正面用「短句」，翻开后用「长情话」。</p>
        <textarea v-model="draftMain" class="editor-area" placeholder="短句，例如：我想你了"></textarea>
        <textarea v-model="draftSub" class="editor-area editor-area-sub" placeholder="长情话，例如：读研路上有我呢"></textarea>
        <div class="editor-btns">
          <button class="editor-btn ghost" @click="resetText">恢复默认</button>
          <button class="editor-btn ghost" @click="showEditor = false">取消</button>
          <button class="editor-btn solid" @click="saveText">保存并重组</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.nebula-page {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: radial-gradient(ellipse at 50% 40%, #0a0a1f 0%, #02020a 70%);
  color: #fff;
  overflow: hidden;
  touch-action: none;
}
.nebula-stage {
  position: absolute;
  inset: 0;
  transition: transform 0.1s ease-out;
}
.nebula-stage :deep(canvas) {
  display: block;
  width: 100% !important;
  height: 100% !important;
}
.nebula-video {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
/* 手势模式：把输入源 video 直接变成右下角预览小窗，免去第二路媒体流 */
.nebula-video.pip {
  width: 128px;
  height: 96px;
  opacity: 1;
  right: 14px;
  bottom: 14px;
  border-radius: 12px;
  object-fit: cover;
  transform: scaleX(-1);
  border: 1px solid rgba(255, 255, 255, 0.28);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

/* HUD */
.neb-hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: opacity 0.28s ease;
}
.neb-hud.hidden {
  opacity: 0;
}
.hud-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  pointer-events: auto;
}
.hud-back,
.hud-immersive {
  font-size: 13px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(16px) saturate(160%);
  -webkit-backdrop-filter: blur(16px) saturate(160%);
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
}
.hud-back:active,
.hud-immersive:active {
  background: rgba(255, 255, 255, 0.26);
}
.hud-title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.6);
}

.hud-status {
  align-self: center;
  font-size: 12px;
  letter-spacing: 1px;
  padding: 8px 20px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.32);
  border: 1px solid rgba(255, 255, 255, 0.16);
  backdrop-filter: blur(18px) saturate(160%);
  -webkit-backdrop-filter: blur(18px) saturate(160%);
  transition: all 0.3s cubic-bezier(0.23, 1, 0.32, 1);
}
.hud-status.active {
  border-color: var(--neb-accent, #00ffea);
  color: var(--neb-accent, #00ffea);
  box-shadow: 0 0 22px rgba(0, 255, 234, 0.22);
}
.hud-status.warn {
  border-color: #ffb14d;
  color: #ffb14d;
}
.hud-status.cooldown {
  border-color: #ff5e62;
  color: #ff5e62;
}

.hud-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  pointer-events: auto;
  margin-top: auto;
}
.hud-btn {
  font: inherit;
  font-size: 12px;
  letter-spacing: 0.5px;
  padding: 8px 14px;
  border-radius: 999px;
  color: #fff;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(16px) saturate(160%);
  -webkit-backdrop-filter: blur(16px) saturate(160%);
  cursor: pointer;
  transition: transform 0.1s ease-out, background 0.2s;
}
.hud-btn:active {
  transform: scale(0.97);
  background: rgba(255, 255, 255, 0.24);
}
.hud-btn.on {
  border-color: var(--neb-accent, #00ffea);
  color: var(--neb-accent, #00ffea);
}
.hud-hint {
  font-size: 11px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.6);
  text-align: center;
  margin-bottom: 4px;
}
.hud-bar {
  position: absolute;
  left: 50%;
  bottom: 120px;
  transform: translateX(-50%);
  width: 180px;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
  opacity: 0;
  transition: opacity 0.25s;
}
.hud-bar.show {
  opacity: 1;
}
.hud-bar-fill {
  height: 100%;
  background: var(--neb-accent, #00ffea);
  box-shadow: 0 0 10px var(--neb-accent, #00ffea);
}

/* 编辑器 */
.editor-mask {
  position: absolute;
  inset: 0;
  z-index: 20;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  pointer-events: auto;
}
.editor-card {
  width: 100%;
  max-width: 420px;
  max-height: 86%;
  overflow-y: auto;
  padding: 18px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: 0 20px 45px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.2);
}
.editor-card h3 {
  margin: 0 0 6px;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.editor-tip {
  margin: 0 0 12px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}
.editor-area {
  width: 100%;
  height: 140px;
  margin-bottom: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 13px;
  line-height: 1.6;
  resize: none;
  box-sizing: border-box;
}
.editor-area-sub {
  height: 120px;
}
.editor-btns {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.editor-btn {
  font: inherit;
  font-size: 13px;
  padding: 9px 16px;
  border-radius: 999px;
  cursor: pointer;
  transition: transform 0.1s ease-out;
}
.editor-btn:active {
  transform: scale(0.97);
}
.editor-btn.ghost {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.28);
  color: rgba(255, 255, 255, 0.85);
}
.editor-btn.solid {
  background: var(--neb-accent, #0a84ff);
  border: none;
  color: #fff;
  font-weight: 600;
}

/* 主题差异：女生柔粉青，男生日落玻璃蓝 */
.nebula-page.theme-female {
  --neb-accent: #ffd93d;
}
.nebula-page.theme-male {
  --neb-accent: #00e5ff;
}
.nebula-page.theme-male .hud-title {
  letter-spacing: -0.01em;
}

@media (prefers-reduced-motion: reduce) {
  .hud-status,
  .neb-hud {
    transition: opacity 0.2s ease;
  }
  .hud-btn:active,
  .editor-btn:active {
    transform: none;
  }
}
</style>
