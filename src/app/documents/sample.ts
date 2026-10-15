import {
  createDocument,
  createEllipse,
  createGroup,
  createLayer,
  createPath,
  createRectangle,
  createText,
  type VectorDocument,
} from '@/core/document'
import { cubicTo, lineTo, matrixFromTransform, moveTo, closePath } from '@/core/geometry'

export const createSampleDocument = (): VectorDocument =>
  createDocument({
    id: 'doc_sample',
    name: 'Sample scene',
    width: 900,
    height: 560,
    background: '#f8fafc',
    metadata: { generator: 'vector-engine', createdAt: '2026-01-01T00:00:00.000Z' },
    layers: [
      createLayer(
        [
          createRectangle(
            { x: 120, y: 90, width: 260, height: 140 },
            {
              id: 'rect_primary',
              name: 'Card',
              cornerRadius: 18,
              style: { fill: { color: '#2563eb' }, stroke: { color: '#1e3a8a', width: 6 } },
            },
          ),
          createEllipse(
            { cx: 520, cy: 190, rx: 78, ry: 78 },
            {
              id: 'ellipse_accent',
              name: 'Accent',
              transform: matrixFromTransform({
                scale: { x: 1.2, y: 0.8 },
                rotateDegrees: 25,
                origin: { x: 520, y: 190 },
              }),
              style: { fill: { color: '#22c55e' }, stroke: { color: '#14532d', width: 10 } },
            },
          ),
          createPath([moveTo(80, 440), lineTo(820, 300)], {
            id: 'path_baseline',
            name: 'Baseline',
            transform: matrixFromTransform({
              translate: { x: 0, y: -20 },
              rotateDegrees: -5,
              origin: { x: 450, y: 370 },
            }),
            style: { stroke: { color: '#0f172a', width: 4 } },
          }),
        ],
        { id: 'layer_shapes', name: 'Shapes' },
      ),
      createLayer(
        [
          createGroup(
            [
              createPath(
                [
                  moveTo(640, 420),
                  cubicTo(690, 300, 780, 300, 830, 420),
                  cubicTo(780, 480, 690, 480, 640, 420),
                  closePath(),
                ],
                {
                  id: 'path_leaf',
                  name: 'Leaf',
                  style: { fill: { color: '#f97316' }, stroke: { color: '#7c2d12', width: 3 } },
                },
              ),
              createRectangle(
                { x: 150, y: 330, width: 160, height: 110 },
                {
                  id: 'rect_glass',
                  name: 'Glass',
                  transform: matrixFromTransform({ rotateDegrees: 12, origin: { x: 230, y: 385 } }),
                  style: { fill: { color: 'rgba(14, 165, 233, 0.85)' } },
                },
              ),
            ],
            { id: 'group_details', name: 'Details', opacity: 0.8 },
          ),
          createText(
            {
              x: 120,
              y: 520,
              content: 'Vector Engine',
              font: { family: 'Inter', size: 28, weight: 600, style: 'normal' },
            },
            { id: 'text_caption', name: 'Caption', style: { fill: { color: '#0f172a' } } },
          ),
        ],
        { id: 'layer_details', name: 'Details', opacity: 0.95 },
      ),
    ],
  })
