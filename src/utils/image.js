// 图片选择与压缩工具（替代 uni.chooseImage + uniCloud.uploadFile）
// 项目未开通 Supabase Storage，图片经 canvas 压缩后以 dataURL 直接存入数据库

// 触发文件选择器，返回用户选中的 File 数组
export function pickImages(count = 1) {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    if (count > 1) input.multiple = true
    input.style.display = 'none'
    document.body.appendChild(input)
    input.addEventListener('change', () => {
      const files = Array.from(input.files || []).slice(0, count)
      document.body.removeChild(input)
      resolve(files)
    })
    // 取消选择时也移除节点
    window.addEventListener(
      'focus',
      () => setTimeout(() => {
        if (document.body.contains(input)) document.body.removeChild(input)
      }, 500),
      { once: true }
    )
    input.click()
  })
}

// 压缩单张图片为 dataURL（保持长宽比，限制最大边长）
export function compressImage(file, maxDim = 1080, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('解析图片失败'))
      img.onload = () => {
        try {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
          const w = Math.max(1, Math.round(img.width * scale))
          const h = Math.max(1, Math.round(img.height * scale))
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, w, h)
          ctx.drawImage(img, 0, 0, w, h)
          resolve(canvas.toDataURL('image/jpeg', quality))
        } catch (e) {
          reject(e)
        }
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

// 选择并压缩多张图片，返回 dataURL 数组
export async function pickAndCompress(count, maxDim = 960, quality = 0.72) {
  const files = await pickImages(count)
  const results = []
  for (const file of files) {
    try {
      results.push(await compressImage(file, maxDim, quality))
    } catch (e) {
      console.warn('图片压缩失败', e)
    }
  }
  return results
}

// 判断内容是否为图片消息（复刻 Linda1 isImage 的启发式判断）
export function isImageContent(content) {
  if (!content) return false
  const c = String(content)
  if (c.startsWith('data:image/')) return true
  if (c.startsWith('http') || c.startsWith('/static')) {
    return /\.(jpe?g|png|gif|webp)(\?.*)?$/i.test(c)
  }
  return false
}

// 物理震动（Web API，部分浏览器/设备不支持时静默）
export function vibrate(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern)
  } catch (e) {
    /* 忽略 */
  }
}
