// Pastel design tokens shared by the dashboard and the report tabs (light + dark).
export type ToneKey = 'mint' | 'sky' | 'peach' | 'lilac' | 'butter' | 'rose'

export const TONES: Record<ToneKey, { card: string; chip: string; ink: string; soft: string; bar: string }> = {
  mint:   { card: 'bg-[#e6f5ee] border-[#d1ebdd] dark:bg-[#1b2a29] dark:border-[#254039]', chip: 'bg-[#c9ecd9] text-[#1d6b48] dark:bg-[#25433a] dark:text-[#8fe0b8]', ink: 'text-[#17533a] dark:text-[#bdf0d6]', soft: 'bg-[#dcf2e6] text-[#1d6b48] dark:bg-[#1f3a31] dark:text-[#8fe0b8]', bar: '#8fd4b0' },
  sky:    { card: 'bg-[#e5f0fc] border-[#cfe2f8] dark:bg-[#1b2638] dark:border-[#26405f]', chip: 'bg-[#c8e0fa] text-[#25588f] dark:bg-[#243d5c] dark:text-[#9cc8f5]', ink: 'text-[#1b4676] dark:text-[#c6e0fb]', soft: 'bg-[#dcebfb] text-[#25588f] dark:bg-[#1e3350] dark:text-[#9cc8f5]', bar: '#9cc8f5' },
  peach:  { card: 'bg-[#fdeee2] border-[#f9dcc5] dark:bg-[#2c2420] dark:border-[#4a372b]', chip: 'bg-[#fad5b8] text-[#9a4b1c] dark:bg-[#4a3526] dark:text-[#f7b98a]', ink: 'text-[#7d3a12] dark:text-[#fbd3b5]', soft: 'bg-[#fde3d0] text-[#9a4b1c] dark:bg-[#3d2a1d] dark:text-[#f7b98a]', bar: '#f7b98a' },
  lilac:  { card: 'bg-[#eee9fc] border-[#ddd3f7] dark:bg-[#231f3a] dark:border-[#3a3361]', chip: 'bg-[#d9cff5] text-[#5a43a6] dark:bg-[#352f5c] dark:text-[#c4b5f5]', ink: 'text-[#46338a] dark:text-[#ddd3f8]', soft: 'bg-[#e8e0fa] text-[#5a43a6] dark:bg-[#2c2749] dark:text-[#c4b5f5]', bar: '#c4b5f5' },
  butter: { card: 'bg-[#fdf5d8] border-[#f7e8b0] dark:bg-[#2b2819] dark:border-[#4a431f]', chip: 'bg-[#f7e5a6] text-[#7d5f08] dark:bg-[#4a421c] dark:text-[#f2d479]', ink: 'text-[#665006] dark:text-[#f7e3a0]', soft: 'bg-[#fcf0c8] text-[#7d5f08] dark:bg-[#3b3417] dark:text-[#f2d479]', bar: '#f2d479' },
  rose:   { card: 'bg-[#fce6ea] border-[#f6d0d8] dark:bg-[#2d1f24] dark:border-[#4d2f38]', chip: 'bg-[#f7c9d3] text-[#a13350] dark:bg-[#4d2f38] dark:text-[#f3a1b3]', ink: 'text-[#862742] dark:text-[#f6c4cf]', soft: 'bg-[#fbdde3] text-[#a13350] dark:bg-[#40232b] dark:text-[#f3a1b3]', bar: '#f0a0b0' },
}
