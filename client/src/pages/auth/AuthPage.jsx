import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Sheet from '../../components/ui/Sheet';
import LogoMark from '../../components/ui/LogoMark';
import LoginForm from './LoginForm';
import SignupForm from './SignupForm';
import { ROUTES } from '../../constants/routes';

const EDGE_FADE =
    'linear-gradient(to right, transparent, #000 4%, #000 96%, transparent), linear-gradient(to bottom, transparent, #000 4%, #000 96%, transparent)';

const FORMS = {
    login: {
        title: 'Login',
        description: 'Use your email and password to continue securely.',
    },
    signup: {
        title: 'Create account',
        description: 'Set up your account to access your secure workspace.',
    },
};

/**
 * The login page.
 *
 * The page is the `public/login.png` artwork shown as-is, with the PayPro
 * wordmark top-left and a Login chip top-right that opens a dialog. Signup is
 * not a page of its own: the dialog's "Sign up" button swaps its content to
 * the signup form (and "Login" swaps it back) — nothing else on the page or
 * in the URL changes. `/signup` redirects here with the dialog closed.
 *
 * From `md` up the artwork is shown whole, in a box with its own aspect ratio
 * (1408 × 768) — never cropped: on wide monitors cropping cut off the panel's
 * logo row — with a blurred copy filling the leftover space. Below `md` it
 * fills the screen instead and is cropped at the sides around the centre:
 * shown whole on a portrait phone it was a thin strip a couple of hundred
 * pixels tall. The wordmark and
 * chip sit over the artwork, so their colours are fixed for a dark backdrop
 * rather than following the light/dark theme.
 */
const AuthPage = () => {
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState('login');
    // Set by the active form while its request is in flight.
    const [busy, setBusy] = useState(false);
    const copy = FORMS[form];

    const openLogin = () => {
        setForm('login');
        setOpen(true);
    };

    return (
        // Backdrop colour sampled from the artwork's edges, so any letterboxing
        // blends into the picture.
        <main className="relative flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden bg-[#06151a] px-4 md:block md:h-dvh md:px-0">
            {/* Fill for the space the contained artwork leaves on very wide or
                tall windows: the same picture, blurred, so there are no bars. */}
            <img
                src="/login.png"
                alt=""
                aria-hidden="true"
                draggable={false}
                className="pointer-events-none absolute inset-0 h-full w-full scale-110 select-none object-cover opacity-50 blur-2xl"
            />

            <div className="absolute max-md:inset-0 md:left-1/2 md:top-1/2 md:aspect-[1408/768] md:w-[min(100vw,calc(100dvh*1408/768))] md:-translate-x-1/2 md:-translate-y-1/2">
                <img
                    src="/login.png"
                    alt=""
                    draggable={false}
                    // Soft edges so the artwork melts into the blurred fill
                    // instead of ending on a hard line.
                    style={{
                        maskImage: EDGE_FADE,
                        WebkitMaskImage: EDGE_FADE,
                        maskComposite: 'intersect',
                        WebkitMaskComposite: 'source-in',
                    }}
                    className="absolute inset-0 h-full w-full select-none object-cover object-center"
                />
                {/* The heading is part of the artwork; this gives it to screen readers. */}
                <h1 className="sr-only">Welcome back, sign in to your control center</h1>
            </div>

            {/* The shield mark stands in for the first "P", so the logo and
                "ayPro" read together as "PayPro". */}
            <Link
                to={ROUTES.WELCOME}
                aria-label="PayPro home"
                className="absolute left-4 top-4 z-10 inline-flex items-center rounded-control sm:left-6 sm:top-6"
            >
                <LogoMark size={40} />
                <span aria-hidden="true" className="-ml-1 text-2xl font-semibold tracking-tight text-[#eef4f6]">
                    ayPro
                </span>
            </Link>

            <nav className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
                <Button variant="primary" size="md" onClick={openLogin} className="rounded-pill px-5">
                    Login
                </Button>
            </nav>

            <Sheet
                open={open}
                onClose={() => setOpen(false)}
                dismissible={!busy}
                title={copy.title}
                description={copy.description}
            >
                <div className="pt-1">
                    {form === 'login' ? (
                        <LoginForm onSwitch={() => setForm('signup')} onBusyChange={setBusy} />
                    ) : (
                        <SignupForm onSwitch={() => setForm('login')} onBusyChange={setBusy} />
                    )}
                </div>
            </Sheet>
        </main>
    );
};

export default AuthPage;
