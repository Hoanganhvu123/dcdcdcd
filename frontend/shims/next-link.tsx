/**
 * `next/link` over react-router's `<Link>`, renaming `href` to `to`.
 *
 * An absolute or protocol-relative href is left to the browser: react-router
 * would treat it as an in-app path and navigate to a route that does not exist.
 */
import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';

export type NextLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string;
  children?: ReactNode;
  prefetch?: boolean;
  replace?: boolean;
};

const isExternal = (href: string) => /^([a-z]+:)?\/\//i.test(href) || href.startsWith('mailto:');

const Link = forwardRef<HTMLAnchorElement, NextLinkProps>(function Link(
  { href, prefetch, replace, children, ...props },
  ref,
) {
  if (isExternal(href)) {
    return (
      <a ref={ref} href={href} {...props}>
        {children}
      </a>
    );
  }
  return (
    <RouterLink ref={ref} to={href} replace={replace} {...props}>
      {children}
    </RouterLink>
  );
});

export default Link;
