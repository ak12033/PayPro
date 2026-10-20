import React from 'react';

/**
 * The PayPro shield mark.
 *
 * Takes the same `size` / `className` props as a lucide icon so it can drop in
 * anywhere an icon component or element is expected (`icon={LogoMark}` or
 * `<LogoMark size={17} />`). Decorative by default: every current placement
 * sits beside the product name or a text label, so it carries an empty alt.
 */
const LogoMark = ({ size = 24, className = '', alt = '', ...rest }) => (
    <img
        src="/logo-mark.png"
        alt={alt}
        width={size}
        height={size}
        draggable={false}
        className={`shrink-0 select-none object-contain ${className}`}
        {...rest}
    />
);

export default LogoMark;
