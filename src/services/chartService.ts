import { ChartConfig, ChartDimensions, ChartPeriod } from '../types';
import { createCanvas, loadImage } from 'canvas';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { Chart } from 'chart.js';
import 'chart.js/auto';
import fs from 'fs';
import path from 'path';

export class ChartService {
    private chartJSNodeCanvas: ChartJSNodeCanvas;
    private canvas: any;
    private dimensions: ChartDimensions;
    private config: ChartConfig;
    private stockPrices: number[];

    constructor(config: ChartConfig, stockPrices: number[]) {
        this.config = config;
        this.stockPrices = stockPrices;
        
        // Set default chart period if not specified
        if (!this.config.chartPeriod) {
            this.config.chartPeriod = 'monthly';
        }
        
        this.dimensions = this.calculateDimensions();
        this.chartJSNodeCanvas = new ChartJSNodeCanvas({
            width: 1920,
            height: 1080,
            backgroundColour: this.config.backgroundColor,
            chartCallback: (ChartJS) => {
                ChartJS.defaults.responsive = false;
                ChartJS.defaults.maintainAspectRatio = false;
            }
        });
        this.canvas = createCanvas(config.width, config.height);

        // Load default Disney logo if not provided
        if (!this.config.imageBuffer && config.title.toLowerCase().includes('disney')) {
            try {
                const logoPath = path.join(process.cwd(), 'imgs', 'disney.png');
                this.config.imageBuffer = fs.readFileSync(logoPath);
            } catch (error) {
                console.error('Error loading default Disney logo:', error);
            }
        }
    }

    private calculateDimensions(): ChartDimensions {
        const padding = 40;  // Increased padding
        const imageHeight = 300;  // Increased logo height
        const titleHeight = 130;   // Increased title height
        const infoHeight = 280;   // Increased info height
        const chartHeight = this.config.chartHeight || 1000;  // Increased chart height
        
        // For daily or weekly charts, we may need extra space for x-axis labels
        const periodAdjustment = (this.config.chartPeriod === 'daily' || this.config.chartPeriod === 'weekly') ? 50 : 0;

        return {
            width: this.config.width,
            height: this.config.height,
            padding,
            chartArea: {
                x: padding,
                y: imageHeight + titleHeight + padding + 20,
                width: this.config.width - (padding * 2),
                height: chartHeight - periodAdjustment
            },
            titleArea: {
                x: padding,
                y: imageHeight + padding,
                width: this.config.width - (padding * 2),
                height: titleHeight
            },
            infoArea: {
                x: padding,
                y: imageHeight + titleHeight + chartHeight + padding + 80,
                width: this.config.width - (padding * 2),
                height: infoHeight
            }
        };
    }

    /**
     * Formats date labels appropriately based on chart period
     * This helps when displaying many data points (daily/weekly)
     */
    private formatXAxisLabels(dates: string[]): string[] {
        if (!this.config.chartPeriod || this.config.chartPeriod === 'monthly') {
            // For monthly, just use the dates as is
            return dates;
        }
        
        // For daily/weekly with many points, we need to reduce label density
        const formattedLabels: string[] = [];
        const totalPoints = dates.length;
        
        for (let i = 0; i < totalPoints; i++) {
            if (this.config.chartPeriod === 'daily') {
                // For daily, show labels for 1st of month and maybe mid-month
                if (dates[i].includes('1,') || (totalPoints < 60 && dates[i].includes('15,'))) {
                    formattedLabels.push(dates[i]);
                } else {
                    formattedLabels.push('');
                }
            } else if (this.config.chartPeriod === 'weekly') {
                // For weekly, show first week of each month
                if (dates[i].includes('1,') || dates[i].includes('2,') || 
                    dates[i].includes('3,') || dates[i].includes('4,') || 
                    dates[i].includes('5,') || dates[i].includes('6,') || 
                    dates[i].includes('7,')) {
                    formattedLabels.push(dates[i]);
                } else {
                    formattedLabels.push('');
                }
            }
        }
        
        return formattedLabels;
    }
    
    async updateChart(
        dates: string[], 
        values: number[], 
        title: string, 
        totalInvested: number[],
        currentShares: number, 
        totalDividends: number,
        formattedDate: string,
        currentStockPrice: number,
        isFinalFrame: boolean = false
    ) {
        // Clear canvas
        const ctx = this.canvas.getContext('2d');
        ctx.fillStyle = this.config.backgroundColor;
        ctx.fillRect(0, 0, this.config.width, this.config.height);

        // Draw company logo if available
        if (this.config.imageBuffer) {
            try {
                const image = await loadImage(this.config.imageBuffer);
                const maxHeight = 280;
                const aspectRatio = image.width / image.height;
                
                // Calculate dimensions maintaining aspect ratio
                let imageHeight = maxHeight;
                let imageWidth = maxHeight * aspectRatio;
                
                // Center the image horizontally
                const imageX = (this.config.width - imageWidth) / 2;
                ctx.drawImage(image, imageX, this.dimensions.padding, imageWidth, imageHeight);
            } catch (error) {
                console.error('Error loading image from buffer:', error);
            }
        }

        // Draw title with word wrapping
        ctx.fillStyle = this.config.fontColor;
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        const words = title.split(' ');
        let line = '';
        let y = this.dimensions.titleArea.y + 40;
        const maxWidth = this.dimensions.titleArea.width;
        
        for (let i = 0; i < words.length; i++) {
            const testLine = line + words[i] + ' ';
            const metrics = ctx.measureText(testLine);
            if (metrics.width > maxWidth && i > 0) {
                ctx.fillText(line, this.config.width / 2, y);
                line = words[i] + ' ';
                y += 50;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line, this.config.width / 2, y);

        // Format x-axis labels based on chart period
        const formattedLabels = this.formatXAxisLabels(dates);
        
        // Configure chart differently based on period
        const displayXAxis = this.config.chartPeriod !== 'monthly';
        const pointRadius = this.config.chartPeriod === 'daily' ? 0 : 
                           (this.config.chartPeriod === 'weekly' ? 
                            (dates.length > 100 ? 0 : 1) : 
                            (dates.length > 24 ? 0 : 3));
                            
        // For daily/weekly charts with many points, use less tension (smoother lines)
        const lineTension = dates.length > 50 ? 0.4 : 0.3;
        
        // Draw chart
        const chartBuffer = await this.chartJSNodeCanvas.renderToBuffer({
            type: 'line',
            data: {
                labels: dates,
                datasets: [{
                    label: 'Portfolio Value',
                    data: values,
                    borderColor: this.config.lineColor,
                    borderWidth: 6,
                    fill: false,
                    tension: lineTension,
                    pointRadius: pointRadius,
                    pointHitRadius: 0
                },
                {
                    label: 'Total Invested',
                    data: totalInvested,
                    borderColor: '#FFFFFF',
                    borderWidth: 4,
                    fill: false,
                    tension: 0,
                    pointRadius: 0,
                    pointHitRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 0
                },
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        display: false,
                        grid: {
                            display: false
                        }
                    },
                    y: {
                        display: false,
                        position: 'left',
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)',
                            drawBorder: false
                        },
                        ticks: {
                            color: this.config.fontColor,
                            callback: function(value: any) {
                                return '$' + Number(value).toLocaleString();
                            },
                            font: {
                                size: 32
                            }
                        }
                    }
                }
            }
        });

        // Create a temporary canvas to draw the chart
        const tempCanvas = createCanvas(this.dimensions.chartArea.width, this.dimensions.chartArea.height);
        const tempCtx = tempCanvas.getContext('2d');
        const tempImage = await loadImage(chartBuffer);
        tempCtx.drawImage(tempImage, 0, 0, this.dimensions.chartArea.width, this.dimensions.chartArea.height);

        // Draw the chart from the temporary canvas to the main canvas
        ctx.drawImage(tempCanvas, 
            this.dimensions.chartArea.x, 
            this.dimensions.chartArea.y, 
            this.dimensions.chartArea.width, 
            this.dimensions.chartArea.height
        );

        if (isFinalFrame) {
            // Add semi-transparent overlay
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(
                this.dimensions.chartArea.x,
                this.dimensions.chartArea.y,
                this.dimensions.chartArea.width,
                this.dimensions.chartArea.height
            );

            // Draw large portfolio value
            const finalValue = Math.round(values[values.length - 1]);
            ctx.fillStyle = this.config.fontColor;
            ctx.font = 'bold 120px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // Draw the dollar sign slightly smaller
            ctx.font = 'bold 100px Arial';
            const dollarSign = '$';
            const dollarWidth = ctx.measureText(dollarSign).width;
            
            // Draw the number in larger font
            ctx.font = 'bold 120px Arial';
            const formattedNumber = finalValue.toLocaleString();
            const numberWidth = ctx.measureText(formattedNumber).width;
            
            // Calculate the total width and center position
            const totalWidth = dollarWidth + numberWidth;
            const centerX = this.dimensions.chartArea.x + (this.dimensions.chartArea.width / 2);
            const centerY = this.dimensions.chartArea.y + (this.dimensions.chartArea.height / 2);
            
            // Draw both parts centered
            ctx.font = 'bold 100px Arial';
            ctx.fillText(dollarSign, centerX - (totalWidth / 2) + (dollarWidth / 2), centerY);
            ctx.font = 'bold 120px Arial';
            ctx.fillText(formattedNumber, centerX + (totalWidth / 2) - (numberWidth / 2), centerY);
        }

        // Get current values
        const currentValue = Math.round(values[values.length - 1]);

        // First row - Date (format based on chart period)
        ctx.font = `${this.config.infoFontSize || 36}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText(formattedDate, this.config.width / 2, this.dimensions.infoArea.y + 20);

        // Second row (larger font) - Portfolio Value
        ctx.font = `bold ${this.config.valueFontSize || 52}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText(`Portfolio Value: $${currentValue.toLocaleString()}`, 
            this.config.width / 2, 
            this.dimensions.infoArea.y + 90
        );
        
        // Third row - Return percentage
        if (totalInvested[totalInvested.length - 1] > 0) {
            const returnPercentage = ((currentValue / totalInvested[totalInvested.length - 1]) - 1) * 100;
            const returnText = returnPercentage >= 0 
                ? `+${returnPercentage.toFixed(1)}%` 
                : `${returnPercentage.toFixed(1)}%`;
            
            ctx.font = `${this.config.infoFontSize || 36}px Arial`;
            ctx.fillStyle = returnPercentage >= 0 ? '#00FF00' : '#FF0000';
            ctx.fillText(returnText, this.config.width / 2, this.dimensions.infoArea.y + 150);
            ctx.fillStyle = this.config.fontColor; // Reset color
        }

        // Fourth row - Stock Price and Total Input
        ctx.textAlign = 'left';
        ctx.fillText(`Stock Price: $${currentStockPrice.toFixed(2)}`, 
            this.dimensions.infoArea.x, 
            this.dimensions.infoArea.y + 200
        );
        ctx.textAlign = 'right';
        ctx.fillText(`Total Input: $${Math.round(totalInvested[totalInvested.length - 1] + totalDividends).toLocaleString()}`, 
            this.dimensions.infoArea.x + this.dimensions.infoArea.width, 
            this.dimensions.infoArea.y + 200
        );

        // Fifth row - Shares and Dividends
        ctx.textAlign = 'left';
        ctx.fillText(`Shares: ${currentShares.toLocaleString()}`, 
            this.dimensions.infoArea.x, 
            this.dimensions.infoArea.y + 250
        );
        ctx.textAlign = 'right';
        ctx.fillText(`Dividends: $${Math.round(totalDividends).toLocaleString()}`, 
            this.dimensions.infoArea.x + this.dimensions.infoArea.width, 
            this.dimensions.infoArea.y + 250
        );

        return false;
    }

    getFrame(): Buffer {
        return this.canvas.toBuffer();
    }
}