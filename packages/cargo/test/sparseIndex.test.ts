// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { createSparseIndexClient, USER_AGENT } from '@reelout/cargo'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const fetchMock = vi.hoisted(() => vi.fn())

const INDEX_URL = 'https://index.crates.io'

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', (...args: unknown[]) => fetchMock(...args))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const indexResponse = (lines: readonly string[]) =>
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: async () => `${lines.join('\n')}\n`,
  })

test('reads and parses crate records', async () => {
  indexResponse([
    '{"vers": "0.1.0", "cksum": "checksum-a", "yanked": false}',
    '{"vers": "0.2.0", "cksum": "checksum-b", "yanked": true}',
  ])

  const client = createSparseIndexClient()

  await expect(client.getRecords('a')).resolves.toEqual({
    status: 'found',
    records: [
      { vers: '0.1.0', cksum: 'checksum-a', yanked: false },
      { vers: '0.2.0', cksum: 'checksum-b', yanked: true },
    ],
  })

  expect(fetchMock.mock.calls[0]).toEqual([
    `${INDEX_URL}/1/a`,
    { headers: { 'User-Agent': USER_AGENT } },
  ])
})

test('reports absent crates for 404 responses', async () => {
  fetchMock.mockResolvedValueOnce({ ok: false, status: 404 })

  const client = createSparseIndexClient()

  await expect(client.getRecords('a')).resolves.toEqual({ status: 'absent' })
})

test('maps crate names to their sparse index paths', async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 404 })

  const client = createSparseIndexClient()

  for (const [name, indexPath] of [
    ['a', '1/a'],
    ['ab', '2/ab'],
    ['abc', '3/a/abc'],
    ['abcd', 'ab/cd/abcd'],
  ] as const) {
    await client.getRecords(name)

    expect(fetchMock).toHaveBeenLastCalledWith(`${INDEX_URL}/${indexPath}`, {
      headers: { 'User-Agent': USER_AGENT },
    })
  }
})

test('caches records across reads and reloads bypass the cache', async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 404 })

  const client = createSparseIndexClient()

  await client.getRecords('a')
  await client.getRecords('a')

  expect(fetchMock).toHaveBeenCalledTimes(1)

  await client.reload('a')

  expect(fetchMock).toHaveBeenCalledTimes(2)

  await client.getRecords('a')

  expect(fetchMock).toHaveBeenCalledTimes(2)
})

test('does not cache failed reads', async () => {
  fetchMock.mockRejectedValueOnce(new Error('mock network failure'))

  const client = createSparseIndexClient()

  await expect(client.getRecords('a')).rejects.toThrow('mock network failure')

  fetchMock.mockResolvedValueOnce({ ok: false, status: 404 })

  await expect(client.getRecords('a')).resolves.toEqual({ status: 'absent' })

  expect(fetchMock).toHaveBeenCalledTimes(2)
})

test('rejects when the index responds with a non-404 error', async () => {
  fetchMock.mockResolvedValueOnce({ ok: false, status: 500 })

  const client = createSparseIndexClient()

  await expect(client.getRecords('a')).rejects.toThrow(
    'The sparse index could not be read for crate "a": HTTP 500.'
  )
})

test('rejects when a record is not valid JSON', async () => {
  indexResponse(['{"vers": '])

  const client = createSparseIndexClient()

  await expect(client.getRecords('a')).rejects.toThrow(
    'The sparse index could not be read for crate "a"'
  )
})

test('rejects records without the expected fields', async () => {
  indexResponse(['{"vers": "1.0.0", "cksum": "checksum-a"}'])

  const client = createSparseIndexClient()

  await expect(client.getRecords('a')).rejects.toThrow(
    'The sparse index could not be read for crate "a": unexpected record format.'
  )
})

test('forwards the abort signal to the index fetch', async () => {
  const controller = new AbortController()

  fetchMock.mockResolvedValueOnce({ ok: false, status: 404 })

  const client = createSparseIndexClient({ signal: controller.signal })

  await client.getRecords('a')

  expect(fetchMock.mock.calls[0]).toEqual([
    `${INDEX_URL}/1/a`,
    { headers: { 'User-Agent': USER_AGENT }, signal: controller.signal },
  ])
})
