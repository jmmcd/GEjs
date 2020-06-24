///////////////////////////////
// fractal code
// https://progur.com/2017/02/create-mandelbrot-fractal-javascript.html
function fractal(MAG,PANX,PANY){
    // Create Canvas
    const myCanvas = document.createElement('canvas');
    myCanvas.width = 720;
    myCanvas.height = 480;
    document.body.appendChild(myCanvas);
    const ctx = myCanvas.getContext('2d');

    // Start drawing
    function checkIfBelongsToMandelbrotSet(x,y) {
        let realComponentOfResult = x;
        let imaginaryComponentOfResult = y;
        // Set max number of iterations
        const maxIterations = 350;
        for (let i = 0; i < maxIterations; i++) {
            const tempRealComponent = realComponentOfResult * realComponentOfResult - imaginaryComponentOfResult * imaginaryComponentOfResult + x;
            const tempImaginaryComponent = 2.0 * realComponentOfResult * imaginaryComponentOfResult + y;
            realComponentOfResult = tempRealComponent;
            imaginaryComponentOfResult = tempImaginaryComponent;
            // Return a number as a percentage
            if (realComponentOfResult * imaginaryComponentOfResult > 5) {
		return (i / maxIterations * 100);
            }
        }
        // Return zero if in set
        return 0;
    }

    // Set appearance settings
    const magnificationFactor = MAG;
    const panX = PANX;
    const panY = PANY;
    for (let x = 0; x < myCanvas.width; x++) {
        for (let y = 0; y < myCanvas.height; y++) {
            const belongsToSet = checkIfBelongsToMandelbrotSet(x / magnificationFactor - panX, y / magnificationFactor - panY);
            if (belongsToSet === 0) {
                ctx.fillStyle = '#000';
                // Draw a black pixel
                ctx.fillRect(x,y, 1,1);
            } else {
                ctx.fillStyle = `hsl(0, 100%, ${belongsToSet}%)`;
                // Draw a colorful pixel
                ctx.fillRect(x,y, 1,1);
            }
        }
    }
}
