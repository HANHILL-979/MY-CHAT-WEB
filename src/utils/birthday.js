import { ref } from 'vue'

const showBirthdayCake = ref(false)

export function triggerBirthdayEffect() {
  showBirthdayCake.value = true
  setTimeout(() => { showBirthdayCake.value = false }, 3000)
}

export function getShowBirthdayCake() {
  return showBirthdayCake
}
