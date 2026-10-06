import { describe, expect, it } from 'vitest'
import type { Scene } from '@ink-garden/engine'
import { drawScene, frameScene, type DrawTarget } from '../src/canvas.ts'

/**
 * The canvas adapter, tested without a browser.
 *
 * A recording target is enough to pin the things that actually go wrong in a
 * second renderer: the frame, the y flip, whether open paths get closed, and
 * whether a shape with no fill is filled anyway. The pixels are checked in a
 * real browser; this checks the commands.
 */
function recorder(): DrawTarget & {
  readonly filled: { x: number; y: number }[][]
  readonly fills: string[]
  readonly closed: boolean[]
  readonly strokes: { width: number; colour: string }[]
} {
  const filled: { x: number; y: number }[][] = []
  const fills: string[] = []
  const closed: boolean[] = []
  const strokes: { width: number; colour: string }[] = []
  let current: { x: number; y: number }[] = []
  let fill = ''
  let strokeWidth = 0
  let strokeColour = ''

  const target = {
    filled,
    fills,
    closed,
    strokes,
    save: () => {},
    restore: () => {},
    beginPath: () => {
      current = []
    },
    moveTo: (x: number, y: number) => {
      current.push({ x, y })
    },
    lineTo: (x: number, y: number) => {
      current.push({ x, y })
    },
    closePath: () => {
      closed.push(true)
    },
    fill: () => {
      filled.push(current)
      fills.push(fill)
    },
    stroke: () => {
      strokes.push({ width: strokeWidth, colour: strokeColour })
    },
    arc: () => {},
    set fillStyle(value: string) {
      fill = value
    },
    set strokeStyle(value: string) {
      strokeColour = value
    },
    set lineWidth(value: number) {
      strokeWidth = value
    },
    set lineJoin(_value: string) {},
    set lineCap(_value: string) {},
  }
  return target as DrawTarget & {
    readonly filled: { x: number; y: number }[][]
    readonly fills: string[]
    readonly closed: boolean[]
    readonly strokes: { width: number; colour: string }[]
  }
}

const scene: Scene = {
  shapes: [
    {
      role: 'leaf',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      fill: '#123456',
    },
    {
      role: 'leaf',
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 5 },
      ],
      fill: 'none',
      stroke: '#abcdef',
      strokeWidth: 0.25,
      closed: false,
    },
  ],
  minX: 0,
  minY: 0,
  maxX: 10,
  maxY: 10,
}

describe('frameScene', () => {
  it('adds padding on both sides', () => {
    const framed = frameScene(scene, { padding: 4 })
    expect(framed.width).toBe(18)
    expect(framed.height).toBe(18)
  })

  it('scales the content, not the padding', () => {
    // Ten units at twice the scale is twenty, plus four of padding at each edge.
    const framed = frameScene(scene, { padding: 4, zoom: 2 })
    expect(framed.width).toBe(28)
  })
})

describe('drawScene', () => {
  it('draws the paper first and then the shapes', () => {
    const target = recorder()
    drawScene(target, scene, { padding: 0 })
    // The background is always filled first, then the flecks, then the shapes.
    expect(target.fills[0]).toBe('#faf7ef')
    expect(target.fills.at(-1)).toBe('#123456')
    // The stroke-only shape must never be filled with its stroke colour.
    expect(target.fills).not.toContain('#abcdef')
  })

  it('flips y, because a plant grows up and a screen grows down', () => {
    const target = recorder()
    drawScene(target, scene, { padding: 0, paper: false })
    // Index 0 is the paper; the triangle is the first shape.
    const triangle = target.filled[1] ?? []
    // The bottom-left of a 10-unit scene must be at the bottom of the frame.
    expect(triangle[0]?.y).toBe(10)
    expect(triangle[1]?.y).toBe(10)
    expect(triangle[2]?.y).toBe(0)
  })

  it('does not fill an unfilled shape, and strokes it', () => {
    const target = recorder()
    drawScene(target, scene, { padding: 0, paper: false })
    // The second shape has fill "none", so it is never filled: the only fills
    // are the paper behind everything and the one solid blade.
    expect(target.fills).toEqual(['#faf7ef', '#123456'])
    expect(target.strokes.length).toBe(1)
    expect(target.strokes[0]?.colour).toBe('#abcdef')
  })

  it('scales a stroke width by the zoom', () => {
    const target = recorder()
    drawScene(target, scene, { padding: 0, paper: false, zoom: 4 })
    expect(target.strokes[0]?.width).toBeCloseTo(1, 6)
  })

  it('reports the frame it drew', () => {
    const target = recorder()
    const result = drawScene(target, scene, { padding: 6 })
    expect(result).toEqual({ width: 22, height: 22 })
  })
})
