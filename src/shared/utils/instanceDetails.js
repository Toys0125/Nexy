/** Content mode is independent of access type and age verification. */
export function getInstanceContentLabel(instance) {
    const mode = instance?.$nexvr?.contentMode;
    switch (mode) {
        case 'sfw':
            return 'SFW';
        case 'sfw_plus':
            return 'SFW+';
        case 'nsfw':
            return 'NSFW';
        case 'nsfw_plus':
            return 'ERP';
        default:
            return '';
    }
}

/** Preserve NexVR access distinctions that share a legacy location tag. */
export function getInstanceAccessKey(instance) {
    if (instance?.$nexvr?.type === 'favourite-friends-only') {
        return 'dialog.instance.favourite_friends';
    }
    return '';
}

/** Compare the stable instance identity, ignoring presence's missing access tags. */
export function sameInstanceLocation(a, b) {
    if (!a || !b || !a.includes(':') || !b.includes(':')) return false;
    return a.split('~')[0] === b.split('~')[0];
}
