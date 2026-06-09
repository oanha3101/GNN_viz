import Plotly from 'plotly.js/lib/core'
import histogram from 'plotly.js/lib/histogram'
import sankey from 'plotly.js/lib/sankey'
import scatter from 'plotly.js/lib/scatter'

// Register only the trace types the app actually renders so the lazy chunk
// stays much smaller than the full Plotly distribution bundle.
Plotly.register([scatter, histogram, sankey])

export default Plotly
