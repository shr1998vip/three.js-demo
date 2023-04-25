<template>
  <div class="home">
    <canvas class="webgl"></canvas>
    <!-- 场景切换点 -->
    <!-- v-show="item.key !== data.currentRoom && item.visible === true" -->

    <TinyMap class="tiny-map" :rotate="data.tinyMapRotate" :position="data.tinyMapPosition" ></TinyMap>
    <div class="switch">
      <span
        class="button"
        v-for="item in data.filterRooms"
        :key="item.key"
        @click="checkoutRoom(item.key)"
      >
        <b class="text">{{ item.name }}</b>
        <i class="icon"></i>
      </span>
    </div>
    <!-- 方位点 -->
    <div
      class="marker"
      :class="`marker-${index}`"
      v-for="(item, index) in markers"
      :key="index"
      @click="clickMarker(item)"
      v-show="item.currentRoom === data.currentRoom"
    ></div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import * as TWEEN from '@tweenjs/tween.js'
import { rooms, markers } from './data.js'
import fragment from '../../shaders/cross/fragment'
import vertex from '../../shaders/cross/vertex'
import Animations from '../../utils/animations'
import TinyMap from '../../components/TinyMap.vue'
import gsap from 'gsap'

const data = reactive({
  sceneOrigin: null, // 初始化场景
  sceneTransition: null, // 过渡场景
  sceneDestination: null, // 目标场景
  camera: null,
  controls: null,
  progress: 0,
  // 相机z轴坐标,
  cameraZAxis: 0.1,
  // 当前房屋key值
  currentRoom: 'living-room',
  // 当前滑动横幅
  sliders: rooms[0].sliders,
  // 显示固定侧边栏的房屋
  filterRooms: rooms.filter(item => item.showSwitch),
  rotate: 0,
  tinyMapPosition: {
    left: 0,
    top: 0,
  },
})

// 初始化贴图
const mapOrigin = markers.find(
  item => item.currentRoom === data.currentRoom
).origin
// console.log(mapOrigin);
// 目标贴图
const mapDestination = markers.find(
  item => item.destinationRoom === data.currentRoom
).origin
// 创建光线投影
const raycaster = new THREE.Raycaster()

// 创建初始化场景
const initScene = () => {
  // 创建原场景
  const sceneOrigin = new THREE.Scene()
  // 创建过渡场景
  const sceneTransition = new THREE.Scene()
  // 创建目标场景
  const sceneDestination = new THREE.Scene()

  // 创建透视相机
  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    4,
    1000
  )

  // 调整相机位置
  camera.position.set(0, 0, 0.1)
  data.camera = camera
  // 把相机添加至场景中
  // sceneOrigin.add(camera)

  // 创建一个球
  const cubeGeometry = new THREE.SphereGeometry(16, 128, 128)
  // 翻转
  cubeGeometry.scale(1, 1, -1)
  const cubeMaterial = new THREE.MeshBasicMaterial({
    map: mapOrigin,
    side: THREE.DoubleSide,
  })

  // 根据几何体和材质构建物体
  const originMesh = new THREE.Mesh(cubeGeometry, cubeMaterial)
  originMesh.rotation.y = Math.PI / 2
  // 将几何体添加至场景中
  sceneOrigin.add(originMesh)
  data.sceneOrigin = sceneOrigin

  const canvas = document.querySelector('.webgl')
  const renderer = new THREE.WebGLRenderer({ canvas })
  renderer.setSize(window.innerWidth, window.innerHeight)
  data.renderer = renderer
  // 创建轨道控制器
  const controls = new OrbitControls(camera, renderer.domElement)
  data.controls = controls

  // 创建目标场景
  const destGeometry = new THREE.SphereGeometry(16, 128, 128)
  destGeometry.scale(1, 1, -1)
  const destMaterial = new THREE.MeshBasicMaterial({
    map: mapDestination,
    side: THREE.DoubleSide,
  })

  const destMesh = new THREE.Mesh(destGeometry, destMaterial)
  destMesh.rotation.y = Math.PI / 2
  sceneDestination.add(destMesh)
  data.sceneDestination = sceneDestination

  const destTexture = new THREE.WebGLRenderTarget(
    window.innerWidth,
    window.innerHeight,
    {
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    }
  )

  // 创建过渡场景
  // 创建过渡场景 WebGLCubeRenderTarget 缓冲
  const tranTexture = new THREE.WebGLRenderTarget(
    window.innerWidth,
    window.innerHeight,
    {
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    }
  )

  // 创建过渡平面图
  const tranGeometry = new THREE.PlaneGeometry(1, 1)
  // 过渡材质
  const tranMaterial = new THREE.ShaderMaterial({
    extensions: {
      derivatives: '#extension GL_OES_standard_derivatives : enable',
    },
    side: THREE.DoubleSide,
    uniforms: {
      progress: { value: 0 },
      sceneOrigin: { value: null },
      sceneDestination: { value: null },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
  })
  const tranMesh = new THREE.Mesh(tranGeometry, tranMaterial)
  sceneTransition.add(tranMesh)
  data.sceneTransition = sceneTransition

  // 创建过渡正交相机
  let frustumSize = 1
  const cameraTransition = new THREE.OrthographicCamera(
    frustumSize / -2,
    frustumSize / 2,
    frustumSize / 2,
    frustumSize / -2,
    -1000,
    1000
  )

  // 页面自适应
  window.addEventListener('resize', () => {
    // 更新摄像头
    camera.aspect = window.innerWidth / window.innerHeight
    // 更新摄像头的投影矩阵
    camera.updateProjectionMatrix()
    // 更新渲染器
    renderer.setSize(window.innerWidth, window.innerHeight)
    // 设置渲染器的像素比
    renderer.setPixelRatio(window.devicePixelRatio)
  })

  // 路径标记物
  const _markers = markers.map((item, index) => {
    return {
      ...item,
      element: document.querySelector(`.marker-${index}`),
    }
  })

  // 创建渲染函数
  const render = () => {
    // 小地图
    if (camera && controls) {
      const dirx = camera.position.x - controls.target.x
      const dirz = camera.position.z - controls.target.z
      const theta = (Math.atan2(dirx, dirz) * 180) / Math.PI
      data.tinyMapRotate = -theta;
      const room = rooms.filter((item) => item.key === data.currentRoom)[0];
      data.tinyMapPosition = room.tinyMapPosition;
    }
    // 地面标记物显隐
    if (_markers) {
      for (const marker of _markers) {
        // console.log(marker);
        const screenPosition = marker.position.clone()
        const pos = screenPosition.project(camera)
        raycaster.setFromCamera(screenPosition, camera)
        const intersects = raycaster.intersectObjects(
          sceneTransition.children,
          true
        )
        if (intersects.length === 0) {
          marker.element.classList.add('visible')
        } else {
          const intersectionDistance = intersects[0].distance
          const markerDistance = marker.position.distanceTo(camera.position)
          intersectionDistance < markerDistance
            ? marker.element.classList.remove('visible')
            : marker.element.classList.add('visible')
        }
        pos.z > 1
          ? marker.element.classList.remove('visible')
          : marker.element.classList.add('visible')
        const translateX = screenPosition.x * window.innerWidth * 0.5
        const translateY = -screenPosition.y * window.innerHeight * 0.5
        marker.element.style.transform = `translateX(${translateX}px) translateY(${translateY}px)`
      }
    }

    renderer.setRenderTarget(destTexture)
    renderer.render(sceneDestination, camera)

    renderer.setRenderTarget(tranTexture)
    renderer.render(sceneOrigin, camera)

    tranMesh.material.uniforms.sceneDestination.value = destTexture.texture
    tranMesh.material.uniforms.sceneOrigin.value = tranTexture.texture
    tranMesh.material.uniforms.progress.value = data.progress

    renderer.setRenderTarget(null)
    renderer.render(sceneTransition, cameraTransition)

    // renderer.render(场景, 相机)
    // renderer.render(sceneOrigin, camera)
    controls && controls.update()
    TWEEN && TWEEN.update()
    requestAnimationFrame(render)
  }
  render()
}

// 点击切换房间
const checkoutRoom = key => {
  // console.log(key);
  const originRoom = markers.find(item => item.currentRoom === data.currentRoom)
  const destinationRoom = markers.find(item => item.currentRoom === key)
  // data.sceneOrigin.children 相机
  // 设置原相机贴图
  // console.log(data.sceneOrigin.children[0].material)

  data.sceneOrigin.children[0].material.map = originRoom.origin
  // 设置目标场景贴图
  // console.log(111);
  data.sceneDestination.children[0].material.map = destinationRoom.origin

  data.progress = 0
  gsap.killTweensOf(data, 'progress')
  gsap.to(data, { duration: 2, progress: 1 })
  data.currentRoom = destinationRoom.currentRoom
  data.sliders = rooms.find(item => item.key === data.currentRoom).sliders || []
  data.showMascot = data.filterRooms.some(
    item => item.key === data.currentRoom && item.sliders
  )
}

// 点击地面交互点
const clickMarker = async marker => {
  // console.log(marker)
  data.sceneOrigin.children[0].material.map = marker.origin
  data.sceneDestination.children[0].material.map = marker.destination
  data.progress = 0
  gsap.killTweensOf(data, 'progress')
  gsap.to(data, { duration: 2, progress: 1 })
  data.currentRoom = marker.destinationRoom
  data.sliders =
    rooms.filter(item => item.key === data.currentRoom)[0].sliders || []
  data.showMascot = data.filtederRooms.some(
    item => item.key === data.currentRoom && item.sliders
  )
  if (data.currentRoom === 'hall-0') {
    Animations.animateCamera(
      data.camera,
      data.controls,
      { x: 0, y: 0, z: data.cameraZAxis },
      { x: 0, y: 0, z: 0 },
      3200,
      () => {}
    )
  }
}
onMounted(() => {
  initScene()
  // Animations.animationCamera(data.camera, data.controls, { x: 0, y: 0, z: data.cameraZAxis }, { x: 0, y: 0, z: 0 }, 1600, () => {});
})
onBeforeUnmount(() => {
  data.keyframeTimeout && clearTimeout(data.keyframeTimeout)
})
</script>
<style lang="stylus" scoped>
.home
  .webgl
    position fixed
    top 0
    left 0
    outline none

  .vr
    position fixed
    top 0
    left 0
    z-index 11
    -webkit-animation slideInLeft 1s .15s
    animation slideInLeft 1s .15s
    -webkit-animation-fill-mode both
    animation-fill-mode both
    .box
      display inline-block
      background rgba(0, 0, 0, .3)
      -webkit-backdrop-filter blur(8px)
      backdrop-filter blur(8px)
      display flex
      align-items center
      justify-content space-around
      overflow hidden
      padding 4px 20px
      border-radius 0 0 16px 0
      border 1px groove rgba(255, 255, 255, .3)
      border-top none
      border-left none
      box-shadow 0 1px 4px rgba(0, 0, 0, .1)
      .icon
        display inline-block
        height 64px
        width 64px
        background url('@/assets/images/home/vr.png') no-repeat center
        background-size contain
        margin-right 12px
      .text
        font-size 24px
        color #ffffff
        display inline-block
        font-weight 500

  .tiny-map
    top 24px
    right 24px
  .switch
    position fixed
    right 24px
    top calc(180PX + 18%)
    z-index 11
    -webkit-animation slideInRight 1s .3s
    animation slideInRight 1s .3s
    -webkit-animation-fill-mode both
    animation-fill-mode both
    .button
      display block
      background rgba(0, 0, 0, .25)
      border-radius 8px
      display flex
      align-items center
      padding 8px 0 8px 24px
      -webkit-backdrop-filter blur(4px)
      -moz-backdrop-filter blur(4px)
      backdrop-filter blur(4px)
      cursor pointer
      transition all .25s ease-out
      border 1px groove rgba(255, 255, 255, .15)
      .text
        color rgba(255, 255, 255, 1)
        font-size 24px
        font-weight normal
      &:not(last-child)
        margin-bottom 24px
      .icon
        display inline-block
        height 30px
        width 30px
        background url('@/assets/images/home/icon_arrow.png') no-repeat center
        background-size 100% 100%
        transform rotate(180deg)
        margin-left 8px
      &:hover
        background rgba(27, 25, 24, .8)
        filter brightness(1.2)
  .point
    position: fixed;
    top: 50%;
    left: 50%;
    z-index 10
    .label
      position: absolute;
      cursor: help;
      transition all .3s ease-in-out;
      display flex
      align-items center
      transform: scale(0, 0);
      &::before
        display inline-block
        content ''
        width: 64PX;
        height: 64PX;
        background-image url('@/assets/images/sprites/interactive.png')
        background-repeat: no-repeat
        background-position: 0 0
        background-size: 100%
        background-position-y: 0
        -webkit-animation: interactivePointAnimation 2s steps(24) forwards infinite;
        animation: interactivePointAnimation 2s steps(24) forwards infinite
        -webkit-animation-fill-mode both;
        animation-fill-mode both;
      .label-tips
        height 88px
        width 200px
        overflow hidden
        font-size 32px
        background rgba(255, 255, 255, .5)
        border-radius 10px
        border 1px solid rgba(255, 255, 255, .5)
        -webkit-backdrop-filter blur(4px)
        -moz-backdrop-filter blur(4px)
        backdrop-filter blur(4px)
        display flex
        justify-content space-between
        align-content center
        .cover
          width 80px
          height 100%
          .icon
            display inline-block
            height 100%
            width 100%
            filter drop-shadow(1px 1px 4px rgba(0, 0, 0, .1))
        .info
          width calc(100% - 80px)
          height 100%
          overflow hidden
          p
            overflow hidden
            text-overflow ellipsis
            text-align left
            &.p1
              font-size 24px
              color #1D1F24
              font-weight 800
              margin 12px 0 2px
            &.p2
              font-size 18px
              color #00452d
              font-weight 500
      &.label-tv
        flex-direction row-reverse
        .label-tips
          left -200px
          flex-direction row-reverse
          .info
            p
              text-align right
    .text
      position: absolute;
      top: 30px;
      left: -120px;
      width: 200px;
      padding: 20px;
      border-radius: 4px;
      background: rgba(0, 0, 0, .6);
      border: 1px solid #ffffff;
      color: #ffffff;
      line-height: 1.3em;
      font-weight: 100;
      font-size: 14px;
      opacity: 0;
      transition: opacity 0.3s;
      pointer-events: none;
      text-align justify
      text-align-last left
    &:hover .text
      opacity: 1;
    &.visible .label
      transform: scale(.8, .8);

  .room-label
    position: fixed;
    top: 50%;
    left: 50%;
    z-index 10
    &-box
      background rgba(0, 0, 0, .2)
      color rgba(255, 255, 255, 1)
      font-size 24px
      padding 12px 24px
      border-radius 8px
      display flex
      align-items center
      justify-content space-around
      transform: scale(0, 0);
      -webkit-backdrop-filter blur(4px);
      backdrop-filter blur(4px);
      cursor pointer
      transition all .5s ease-out
      position relative
      &::after
        display inline-block
        content ''
        height 40px
        width 40px
        background url('@/assets/images/home/icon_arrow.png') no-repeat center
        background-size 100% 100%
        position absolute
        left -48px
        transform rotate(360deg)
        animation arrowLeft 2.8s ease-in-out infinite
    &.visible
      .room-label-box
        transform: scale(1, 1);

.github {
  position: fixed;
  left: 0;
  bottom: 0;
  z-index: 1;
  font-size: 18PX;
  color: rgba(0, 0, 0, 1);
  display: flex;
  align-items: center;
  padding: 16px;
  transition: all .25s ease-in-out;
  text-decoration: none;
  text-shadow: 0 1px 2px rgba(0, 0, 0, .2);
  opacity: .8;
}

.github:hover {
  opacity: .5;
}

.github .author {
  padding-left: 8px;
}

.animate-point-wave::before {
  content: '';
  animation: bounce-wave 1.5s infinite;
}
.animate-point-wave::after {
  content: '';
  animation: bounce-wave 1.5s -0.4s infinite;
}

@keyframes bounce-wave {
  0% {
    transform: scale(0.8);
    opacity: 1;
  }
  100% {
    transform: scale(2.2);
    opacity: 0;
  }
}
.marker
  position: fixed;
  top: 50%;
  left: 50%;
  z-index 12
  display none
  &::after
    display inline-block
    content ''
    height 64PX
    width 64PX
    background-image url('@/assets/images/sprites/marker.png')
    background-repeat: no-repeat
    background-position: 0 0
    background-size: 100%
    background-position-y: 0
    -webkit-animation: markerAnimation 2s steps(20) forwards infinite
    animation: markerAnimation 2s steps(20) forwards infinite
    -webkit-animation-fill-mode both;
    animation-fill-mode both;
    transition all linear
    cursor pointer
    transform: scale(0, 0);
    opacity .5
  &:hover
    &::after
      filter brightness(1.2)
      opacity 1
  &.visible
    display block
    &::after
      transform: scale(.8, .8);


@-webkit-keyframes markerAnimation {
  0% {
    background-position: 0 0;
  }
  to {
    background-position: 0 -1280PX;
  }
}
@keyframes markerAnimation {
  0% {
    background-position: 0 0
  }
  to {
    background-position: 0 -1280PX;
  }
}

@keyframes markerBounce {
  0% {
    transform: scale(0.5);
    opacity: .8;
  }
  100% {
    transform: scale(2);
    opacity: 0;
  }
}

@keyframes arrowLeft {
  0% {
    transform: translateX(-2px);
    opacity: 0.8;
  }
  50% {
    transform: translateX(-10px);
    opacity: 0.8;
  }
  100% {
    transform: translateX(-2px);
    opacity: 0.8;
  }
}

@-webkit-keyframes interactivePointAnimation {
  0% {
    background-position: 0 0;
  }
  50% {
    background-position: 0 -1536PX;
  }
}
@keyframes interactivePointAnimation {
  0% {
    background-position: 0 0
  }
  to {
    background-position: 0 -1536PX;
  }
}
</style>
