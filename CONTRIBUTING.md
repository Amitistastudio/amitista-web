# Contributing

Thanks for taking the time to contribute.

## Getting set up

```sh
npm install
npm run dev
```

See [README.md](README.md) for the environment variables and script list.

## Before opening a pull request

- Run `npm run lint` and fix anything it flags.
- Run `npm run build` — this also runs the site's prerender and secret-scan
  checks, so it will catch a broken route or an accidentally-committed
  credential before either reaches review.
- Keep pull requests focused. Unrelated cleanups are easier to review as their
  own PR.
- Describe *what* changed and *why* in the PR description — screenshots are
  appreciated for anything visual.

## Commit messages

Write a short, descriptive summary line. There's no enforced convention
beyond that, but a message that explains *why* a change was made is more
useful in review and in `git log` later than one that just restates the diff.

## Reporting bugs and requesting features

Open an issue using the templates provided. Include steps to reproduce for
bugs, and the problem you're trying to solve for feature requests.

## Security issues

Please don't open a public issue for a security vulnerability — see
[SECURITY.md](SECURITY.md) instead.

## Code of Conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). By
participating, you're expected to uphold it.
