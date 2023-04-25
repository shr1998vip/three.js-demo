import * as TWEEN from '@tweenjs/tween.js'

const Animations = {
  animationCamera: (camera, controls, newP, newT, time = 200, callback) => {
    // 获取原本坐标
    const tween = new TWEEN.Tween({
      x1: camera.position.x,
      y1: camera.position.y,
      z1: camera.position.z,
      x2: controls.target.x,
      y2: controls.target.y,
      z2: controls.target.z
    })
    // 设置新坐标
    tween.to({
      x1: newP.x,
      y1: newP.y,
      z1: newP.z,
      x2: newT.x,
      y2: newT.y,
      z2: newT.z
    },
      time
    )
    tween.onUpdate((obj) => {
      camera.position.x = obj.x1,
      camera.position.y = obj.y1,
      camera.position.z = obj.z1,
      controls.target.x = obj.x2,
      controls.target.y = obj.y2,
      controls.target.z = obj.z2,
      controls.update()
    })
    tween.onComplete(() => {
      controls.enabled = true,
      controls.update()
      callback()
    })
    tween.easing(TWEEN.Easing.Cubic.InOut)
    tween.start()
  }
}
export default Animations