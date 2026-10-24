import { expect, test } from '@playwright/test'
import { Buffer } from 'node:buffer'

test('renders the default scene and exposes export controls', async ({ page, isMobile }) => {
  await page.goto('/')

  await expect(page.getByText('VECTOR ENGINE')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Preview' })).toBeVisible()
  await expect(page.getByAltText('Rendered vector scene')).toBeVisible()
  await expect(page.getByText('Scene valid')).toBeVisible()
  if (!isMobile) {
    await expect(page.getByText('C++23 · WebAssembly')).toBeVisible()
  }
  if (isMobile) {
    await page.getByRole('button', { name: 'Export' }).last().click()
  }
  await expect(page.getByRole('button', { name: 'PNG Lossless' })).toBeVisible()
  await expect(page.getByText('1. Target')).toBeVisible()
  await expect(page.getByText('6. Preview')).toBeVisible()
})

test('downloads a valid PNG export', async ({ page, isMobile }) => {
  await page.goto('/')
  if (isMobile) {
    await page.getByRole('button', { name: 'Export' }).last().click()
  }

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export PNG' }).click()
  const download = await downloadPromise
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk))
  }
  const data = Buffer.concat(chunks)

  expect(download.suggestedFilename()).toBe('orbit-study.png')
  expect(Array.from(data.subarray(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47])
})

test('exports a multi-item batch ZIP archive with templated filenames', async ({ page, isMobile }) => {
  await page.goto('/')
  if (isMobile) {
    await page.getByRole('button', { name: 'Export' }).last().click()
  }

  await page.getByRole('button', { name: 'Batch', exact: true }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Export ZIP/i }).click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toBe('orbit-study-batch.zip')
})

test('mobile navigation switches between workspace panels', async ({ page, isMobile }) => {
  test.skip(!isMobile)
  await page.goto('/')

  await page.getByRole('button', { name: 'JSON', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Scene JSON' })).toBeVisible()
  await page.getByRole('button', { name: 'Export' }).last().click()
  await expect(page.getByRole('heading', { name: 'Export' })).toBeVisible()
})

test('inspector edits object properties, syncs the canvas and supports undo', async ({ page, isMobile }) => {
  await page.goto('/')
  if (isMobile) {
    await page.getByRole('button', { name: 'Properties', exact: true }).click()
  }

  await expect(page.getByRole('heading', { name: 'Inspector' })).toBeVisible()
  await expect(page.getByText('Layers').first()).toBeVisible()
  await expect(page.getByText('Transform').first()).toBeVisible()
  await expect(page.getByText('Appearance').first()).toBeVisible()

  await page.getByRole('option', { name: /Card Frame/ }).click()
  await expect(page.getByText('Card Frame').first()).toBeVisible()

  const width = page.getByLabel('Width')
  await expect(width).toHaveValue('1040')

  const preview = page.getByAltText('Rendered vector scene')
  await expect.poll(() => preview.getAttribute('src')).not.toBeNull()
  const before = await preview.getAttribute('src')

  await width.fill('900')
  await expect(width).toHaveValue('900')
  await expect
    .poll(async () => preview.getAttribute('src'))
    .not.toBe(before)

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(width).toHaveValue('1040')
})
