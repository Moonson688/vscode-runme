import { ApolloClient, InMemoryCache, HttpLink } from '@apollo/client'
import fetch from 'cross-fetch'
import { setContext } from '@apollo/client/link/context'
import { Uri } from 'vscode'

import { getRunmeAppUrl } from '../../utils/configuration'

export function InitializeClient({
  uri,
  runmeToken,
}: {
  uri?: string | undefined
  runmeToken: string
}) {
  const authLink = setContext((_, { headers }) => {
    return {
      headers: {
        ...headers,
        authorization: runmeToken ? `Bearer ${runmeToken}` : '',
      },
    }
  })
  const appApiUrl = Uri.joinPath(Uri.parse(getRunmeAppUrl(['api']), true), '/graphql').toString()
  const link = new HttpLink({ fetch, uri: uri || appApiUrl })
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    credentials: 'include',
    link: authLink.concat(link),
  })

  return client
}
