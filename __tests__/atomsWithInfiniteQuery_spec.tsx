import React, { Component, StrictMode, Suspense, useCallback } from 'react'
import type { ReactNode } from 'react'
import { fireEvent, render } from '@testing-library/react'
import { useAtom, useSetAtom } from 'jotai/react'
import { atom } from 'jotai/vanilla'
import { atomsWithInfiniteQuery } from '../src/index'

beforeEach(() => {
  jest.useFakeTimers()
})
afterEach(() => {
  jest.runAllTimers()
  jest.useRealTimers()
})

it('infinite query basic test', async () => {
  let resolve = () => {}
  const [countAtom] = atomsWithInfiniteQuery<
    { response: { count: number } },
    void
  >(() => ({
    queryKey: ['count1Infinite'],
    queryFn: async (context) => {
      const count = context.pageParam ? parseInt(context.pageParam) : 0
      await new Promise<void>((r) => (resolve = r))
      return { response: { count } }
    },
  }))

  const Counter = () => {
    const [data] = useAtom(countAtom)
    return (
      <>
        <div>page count: {data.pages.length}</div>
      </>
    )
  }

  const { findByText } = render(
    <StrictMode>
      <Suspense fallback="loading">
        <Counter />
      </Suspense>
    </StrictMode>
  )

  await findByText('loading')
  resolve()
  await findByText('page count: 1')
})

it('infinite query next page test', async () => {
  const mockFetch = jest.fn((response) => ({ response }))
  let resolve = () => {}
  const [countAtom] = atomsWithInfiniteQuery<
    { response: { count: number } },
    void
  >(() => ({
    queryKey: ['nextPageAtom'],
    queryFn: async (context) => {
      const count = context.pageParam ? parseInt(context.pageParam) : 0
      await new Promise<void>((r) => (resolve = r))
      return mockFetch({ count })
    },
    getNextPageParam: (lastPage) => {
      const {
        response: { count },
      } = lastPage
      return (count + 1).toString()
    },
    getPreviousPageParam: (lastPage) => {
      const {
        response: { count },
      } = lastPage
      return (count - 1).toString()
    },
  }))
  const Counter = () => {
    const [data, dispatch] = useAtom(countAtom)

    return (
      <>
        <div>page count: {data.pages.length}</div>
        <button onClick={() => dispatch({ type: 'fetchNextPage' })}>
          next
        </button>
        <button onClick={() => dispatch({ type: 'fetchPreviousPage' })}>
          prev
        </button>
      </>
    )
  }

  const { findByText, getByText } = render(
    <>
      <Suspense fallback="loading">
        <Counter />
      </Suspense>
    </>
  )

  await findByText('loading')
  resolve()
  await findByText('page count: 1')
  expect(mockFetch).toBeCalledTimes(1)

  fireEvent.click(getByText('next'))
  resolve()
  await findByText('page count: 2')
  expect(mockFetch).toBeCalledTimes(2)

  fireEvent.click(getByText('prev'))
  resolve()
  await findByText('page count: 3')
  expect(mockFetch).toBeCalledTimes(3)
})

it('infinite query with enabled', async () => {
  const slugAtom = atom<string | null>(null)

  let resolve = () => {}
  const [, slugQueryAtom] = atomsWithInfiniteQuery((get) => {
    const slug = get(slugAtom)
    return {
      enabled: !!slug,
      queryKey: ['disabled_until_value', slug],
      queryFn: async () => {
        await new Promise<void>((r) => (resolve = r))
        return { response: { slug: `hello-${slug}` } }
      },
    }
  })

  const Slug = () => {
    const [{ data }] = useAtom(slugQueryAtom)
    if (!data?.pages?.[0]?.response.slug) return <div>not enabled</div>
    return <div>slug: {data?.pages?.[0]?.response?.slug}</div>
  }

  const Parent = () => {
    const [, setSlug] = useAtom(slugAtom)
    return (
      <div>
        <button
          onClick={() => {
            setSlug('world')
          }}>
          set slug
        </button>
        <Slug />
      </div>
    )
  }

  const { getByText, findByText } = render(
    <StrictMode>
      <Suspense fallback="loading">
        <Parent />
      </Suspense>
    </StrictMode>
  )

  await findByText('not enabled')

  fireEvent.click(getByText('set slug'))
  // await findByText('loading')
  resolve()
  await findByText('slug: hello-world')
})

it('infinite query with enabled 2', async () => {
  jest.useRealTimers() // FIXME can avoid?

  const enabledAtom = atom<boolean>(true)
  const slugAtom = atom<string | null>('first')

  const [slugQueryAtom] = atomsWithInfiniteQuery((get) => {
    const slug = get(slugAtom)
    const isEnabled = get(enabledAtom)
    return {
      enabled: isEnabled,
      queryKey: ['enabled_toggle'],
      queryFn: async () => {
        await new Promise<void>((r) => setTimeout(r, 100)) // FIXME can avoid?
        return { response: { slug: `hello-${slug}` } }
      },
    }
  })

  const Slug = () => {
    const [data] = useAtom(slugQueryAtom)
    if (!data?.pages?.[0]?.response?.slug) return <div>not enabled</div>
    return <div>slug: {data?.pages?.[0]?.response?.slug}</div>
  }

  const Parent = () => {
    const [, setSlug] = useAtom(slugAtom)
    const [, setEnabled] = useAtom(enabledAtom)
    return (
      <div>
        <button
          onClick={() => {
            setSlug('world')
          }}>
          set slug
        </button>
        <button
          onClick={() => {
            setEnabled(true)
          }}>
          set enabled
        </button>
        <button
          onClick={() => {
            setEnabled(false)
          }}>
          set disabled
        </button>
        <Slug />
      </div>
    )
  }

  const { getByText, findByText } = render(
    <StrictMode>
      <Suspense fallback="loading">
        <Parent />
      </Suspense>
    </StrictMode>
  )

  await findByText('loading')
  await findByText('slug: hello-first')

  await new Promise((r) => setTimeout(r, 100)) // FIXME we want to avoid this
  fireEvent.click(getByText('set disabled'))
  fireEvent.click(getByText('set slug'))

  await new Promise((r) => setTimeout(r, 100)) // FIXME we want to avoid this
  await findByText('slug: hello-first')

  await new Promise((r) => setTimeout(r, 100)) // FIXME we want to avoid this
  fireEvent.click(getByText('set enabled'))
  await findByText('slug: hello-world')
})

// adapted from https://github.com/tannerlinsley/react-query/commit/f9b23fcae9c5d45e3985df4519dd8f78a9fa364e#diff-121ad879f17e2b996ac2c01b4250996c79ffdb6b7efcb5f1ddf719ac00546d14R597
it('should be able to refetch only specific pages when refetchPages is provided', async () => {
  const key = ['refetch_given_page']
  const states: any[] = []

  let multiplier = 1
  const [anAtom] = atomsWithInfiniteQuery<number, void>(() => {
    return {
      queryKey: key,
      queryFn: ({ pageParam = 10 }) => Number(pageParam) * multiplier,
      getNextPageParam: (lastPage) => lastPage + 1,
      onSuccess: (data) => states.push(data),
    }
  })

  function Page() {
    const [state, setState] = useAtom(anAtom)

    const fetchNextPage = useCallback(
      () => setState({ type: 'fetchNextPage' }),
      [setState]
    )

    const refetchPage = useCallback(
      (value: number) => {
        multiplier = 2
        setState({
          type: 'refetch',
          options: {
            refetchPage: (_, index) => index === value,
          },
        })
      },
      [setState]
    )

    return (
      <>
        <div>length: {state.pages.length}</div>
        <div>page 1: {state.pages[0] || null}</div>
        <div>page 2: {state.pages[1] || null}</div>
        <div>page 3: {state.pages[2] || null}</div>
        <button onClick={fetchNextPage}>fetch next page</button>
        <button onClick={() => refetchPage(0)}>refetch page 1</button>
      </>
    )
  }

  const { getByText, findByText } = render(
    <>
      <Suspense fallback="loading">
        <Page />
      </Suspense>
    </>
  )

  await findByText('loading')

  await findByText('length: 1')
  await findByText('page 1: 10')

  fireEvent.click(getByText('fetch next page'))
  await findByText('length: 2')
  await findByText('page 2: 11')

  fireEvent.click(getByText('fetch next page'))
  await findByText('length: 3')
  await findByText('page 3: 12')

  fireEvent.click(getByText('refetch page 1'))
  await findByText('length: 3')
  await findByText('page 1: 20')
})

describe('error handling', () => {
  class ErrorBoundary extends Component<
    { message?: string; retry?: () => void; children: ReactNode },
    { hasError: boolean }
  > {
    constructor(props: { message?: string; children: ReactNode }) {
      super(props)
      this.state = { hasError: false }
    }
    static getDerivedStateFromError() {
      return { hasError: true }
    }
    render() {
      return this.state.hasError ? (
        <div>
          {this.props.message || 'errored'}
          {this.props.retry && (
            <button
              onClick={() => {
                this.props.retry?.()
                this.setState({ hasError: false })
              }}>
              retry
            </button>
          )}
        </div>
      ) : (
        this.props.children
      )
    }
  }

  it('can catch error in error boundary', async () => {
    let resolve = () => {}
    const [countAtom] = atomsWithInfiniteQuery(() => ({
      queryKey: ['error test', 'count1Infinite'],
      retry: false,
      queryFn: async (): Promise<{ response: { count: number } }> => {
        await new Promise<void>((r) => (resolve = r))
        throw new Error('fetch error')
      },
    }))
    const Counter = () => {
      const [{ pages }] = useAtom(countAtom)
      return (
        <>
          <div>count: {pages[0]?.response.count}</div>
        </>
      )
    }

    const { findByText } = render(
      <StrictMode>
        <ErrorBoundary>
          <Suspense fallback="loading">
            <Counter />
          </Suspense>
        </ErrorBoundary>
      </StrictMode>
    )

    await findByText('loading')
    resolve()
    await findByText('errored')
  })

  it('can recover from error', async () => {
    let count = -1
    let willThrowError = false
    let resolve = () => {}
    const [countAtom] = atomsWithInfiniteQuery<
      { response: { count: number } },
      void
    >(() => ({
      queryKey: ['error test', 'count2Infinite'],
      retry: false,
      staleTime: 200,
      queryFn: async () => {
        willThrowError = !willThrowError
        ++count
        await new Promise<void>((r) => (resolve = r))
        if (willThrowError) {
          throw new Error('fetch error')
        }
        return { response: { count } }
      },
    }))
    const Counter = () => {
      const [{ pages }, dispatch] = useAtom(countAtom)
      const refetch = () => dispatch({ type: 'refetch', options: {} })
      return (
        <>
          <div>count: {pages[0]?.response.count}</div>
          <button onClick={refetch}>refetch</button>
        </>
      )
    }

    const App = () => {
      const dispatch = useSetAtom(countAtom)
      const retry = () => {
        dispatch({ type: 'refetch', force: true, options: {} })
      }
      return (
        <ErrorBoundary retry={retry}>
          <Suspense fallback="loading">
            <Counter />
          </Suspense>
        </ErrorBoundary>
      )
    }

    const { findByText, getByText } = render(
      <StrictMode>
        <App />
      </StrictMode>
    )

    await findByText('loading')
    resolve()
    await findByText('errored')

    fireEvent.click(getByText('retry'))
    await findByText('loading')
    resolve()
    await findByText('count: 1')

    fireEvent.click(getByText('refetch'))
    resolve()
    // await findByText('loading')
    resolve()
    await findByText('errored')

    fireEvent.click(getByText('retry'))
    await findByText('loading')
    resolve()
    await findByText('count: 3')
  })
})
