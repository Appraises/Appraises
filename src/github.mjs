const CONTRIBUTION_QUERY = `
  query ContributionCalendar($login: String!) {
    user(login: $login) {
      login
      name
      contributionsCollection {
        contributionCalendar {
          totalContributions
          colors
          isHalloween
          weeks {
            firstDay
            contributionDays {
              date
              weekday
              contributionCount
              contributionLevel
              color
            }
          }
        }
      }
    }
  }
`;

export async function fetchContributionCalendar({ username, token }) {
  if (!username) {
    throw new Error(
      'Missing GitHub username. Set GITHUB_USER or pass --user <login>.',
    );
  }
  if (!token) {
    throw new Error(
      'Missing GitHub token. Set GITHUB_TOKEN, or run npm run generate:demo.',
    );
  }

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'user-agent': 'github-contribution-graph-traversal',
    },
    body: JSON.stringify({
      query: CONTRIBUTION_QUERY,
      variables: { login: username },
    }),
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(
      `GitHub GraphQL returned a non-JSON response (${response.status}).`,
    );
  }

  if (!response.ok || payload.errors?.length) {
    const details = payload.errors
      ?.map((error) => error.message)
      .join('; ');
    throw new Error(
      `Unable to load GitHub contributions (${response.status}): ${
        details || response.statusText
      }`,
    );
  }

  const user = payload.data?.user;
  if (!user) {
    throw new Error(`GitHub user "${username}" was not found.`);
  }

  return {
    owner: user.login,
    displayName: user.name || user.login,
    calendar: user.contributionsCollection.contributionCalendar,
  };
}
