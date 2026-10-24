import type { SceneObject, VectorScene } from '@/types/scene'

export const cloneScene = (scene: VectorScene): VectorScene =>
  JSON.parse(JSON.stringify(scene)) as VectorScene

export const serializeScene = (scene: VectorScene): string =>
  JSON.stringify(scene, null, 2)

export const walkObjects = (
  objects: readonly SceneObject[],
  visit: (object: SceneObject) => void,
): void => {
  for (const object of objects) {
    visit(object)
    if (object.type === 'group') {
      walkObjects(object.children, visit)
    }
  }
}

export const collectSceneObjects = (scene: VectorScene): SceneObject[] => {
  const result: SceneObject[] = []
  for (const layer of scene.layers ?? []) {
    walkObjects(layer.objects, (object) => result.push(object))
  }
  walkObjects(scene.objects, (object) => result.push(object))
  return result
}

export const findObjectsById = (
  scene: VectorScene,
  ids: readonly string[],
): SceneObject[] => {
  const wanted = new Set(ids)
  const result: SceneObject[] = []

  const visit = (objects: readonly SceneObject[]): void => {
    for (const object of objects) {
      if (wanted.has(object.id)) {
        result.push(object)
      }
      if (object.type === 'group') {
        visit(object.children)
      }
    }
  }

  for (const layer of scene.layers ?? []) {
    visit(layer.objects)
  }
  visit(scene.objects)

  return result
}

export const findObjectById = (
  scene: VectorScene,
  id: string,
): SceneObject | null => {
  const matches = findObjectsById(scene, [id])
  return matches[0] ?? null
}
