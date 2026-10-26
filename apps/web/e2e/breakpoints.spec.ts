import { expect, test } from '@playwright/test'
import { HEIGHT_TIERS, WIDTH_TIERS, resolveHeightTier, resolveWidthTier } from '../src/styles/breakpoints'

const parseTracks = (value: string): string[] => value.split(/\s+/).filter(Boolean)

/** Resolved pixel size of a grid track; `fr` tracks resolve to pixels in Chromium. */
const trackPx = (track: string | undefined): number => Number.parseFloat(track ?? '')

const gridColumns = (page: import('@playwright/test').Page): Promise<string> =>
  page.locator('.workspace').evaluate((element) => getComputedStyle(element).gridTemplateColumns)

const gridRows = (page: import('@playwright/test').Page): Promise<string> =>
  page.locator('.app-shell').evaluate((element) => getComputedStyle(element).gridTemplateRows)

test.describe('monitor resolution layout', () => {
  for (const tier of WIDTH_TIERS) {
    test(`keeps every workspace column usable on a ${tier.resolution} ${tier.label.toLowerCase()}`, async ({
      page,
      isMobile,
    }) => {
      test.skip(isMobile, 'Desktop breakpoints only')
      const height = Number.parseInt(tier.resolution.split(' × ')[1] ?? '900', 10)
      await page.setViewportSize({ width: tier.minWidth, height })
      await page.goto('/')
      await expect(page.getByRole('heading', { name: 'Preview' })).toBeVisible()

      const columns = parseTracks(await gridColumns(page))
      expect(columns).toHaveLength(4)
      expect(trackPx(columns[0])).toBeGreaterThanOrEqual(tier.columns.sourceMin)
      expect(trackPx(columns[1])).toBeGreaterThanOrEqual(tier.columns.previewMin)
      expect(Math.round(trackPx(columns[2]))).toBe(tier.columns.properties)
      expect(Math.round(trackPx(columns[3]))).toBe(tier.columns.export)

      for (const panel of ['.editor-column', '.preview-column', '.inspector-column', '.export-column']) {
        await expect(page.locator(panel)).toBeVisible()
      }
    })
  }

  test('grows the canvas as the monitor gets wider', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop breakpoints only')
    const canvasWidthAt = async (width: number): Promise<number> => {
      await page.setViewportSize({ width, height: 1080 })
      const columns = parseTracks(await gridColumns(page))
      return trackPx(columns[1])
    }

    const laptop = await canvasWidthAt(1366)
    const fullHd = await canvasWidthAt(1920)
    const qhd = await canvasWidthAt(2560)
    const uhd = await canvasWidthAt(3840)

    expect(fullHd).toBeGreaterThan(laptop)
    expect(qhd).toBeGreaterThan(fullHd)
    expect(uhd).toBeGreaterThan(qhd)
  })

  test('resolves the active tier from the viewport width', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop breakpoints only')
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto('/')
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    expect(resolveWidthTier(viewportWidth)?.id).toBe('full-hd')
  })
})

test.describe('monitor height layout', () => {
  for (const tier of HEIGHT_TIERS) {
    test(`compresses the chrome on a ${tier.resolution} ${tier.label.toLowerCase()} viewport`, async ({
      page,
      isMobile,
    }) => {
      test.skip(isMobile, 'Desktop breakpoints only')
      const width = Number.parseInt(tier.resolution.split(' × ')[0] ?? '1366', 10)
      await page.setViewportSize({ width, height: tier.maxHeight })
      await page.goto('/')
      await expect(page.getByRole('heading', { name: 'Preview' })).toBeVisible()

      const viewportHeight = await page.evaluate(() => window.innerHeight)
      expect(resolveHeightTier(viewportHeight)?.id).toBe(tier.id)

      const rows = parseTracks(await gridRows(page))
      expect(rows).toHaveLength(3)
      expect(trackPx(rows[0])).toBeLessThanOrEqual(60)
      expect(trackPx(rows[2])).toBeLessThanOrEqual(27)
    })
  }

  test('keeps the dense desktop chrome out of narrow windows', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop breakpoints only')
    await page.setViewportSize({ width: 820, height: 700 })
    await page.goto('/')
    await expect(page.locator('.mobile-tabs')).toBeVisible()
    expect(await page.locator('.editor-column').isVisible()).toBe(false)
  })
})
