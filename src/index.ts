import { ChartService } from './services/chartService';
import { VideoService } from './services/videoService';
import { ChartConfig, ChartPeriod } from './types';
import path from 'path';
import yahooFinance from 'yahoo-finance2';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import fs from 'fs';

interface MonthlyDataPoint {
    date: string;
    formattedDate: string; // Added for proper date display
    stockPrice: number;    // Added to track actual stock price
    shares: number;
    totalInvested: number;
    portfolioValue: number;
    totalDividends: number;
    cashBalance: number;   // Added to track cash balance
}

interface ChartDataPoint {
    date: string;         // Date for chart display (may vary by period)
    formattedDate: string; // Formatted date for display
    portfolioValue: number; // Portfolio value for this point
    totalInvested: number;  // Total invested at this point
    shares?: number;        // Current shares (only for monthly points)
    totalDividends?: number; // Total dividends (only for monthly points)
    stockPrice: number;     // Stock price at this point
}

interface StockDataPoint {
    date: string;          // Format: 'Jan 2020' for monthly or actual date for daily/weekly
    formattedDate: string; // Format: 'January 2020' or appropriate date format
    value: number;         // Stock price
    dividend: number;      // Dividend per share for that period (0 for non-monthly)
    timestamp: number;     // Unix timestamp for easy ordering/filtering
}

interface YahooDividend {
    date: number;  // Unix timestamp
    amount: number;
}

interface YahooQuote {
    date: number;  // Unix timestamp
    close: number | null;
}

interface YahooAPIResponse {
    quotes: {
        adjclose?: number | null;
        date: number;  // Unix timestamp in seconds
        high: number | null;
        low: number | null;
        open: number | null;
        close: number | null;
        volume: number | null;
    }[];
    events?: {
        dividends: {
            date: number;  // Unix timestamp in seconds
            amount: number;
        }[];
    };
}

// Helper function to format month names
function formatMonthName(shortMonth: string): string {
    const monthMap: { [key: string]: string } = {
        'Jan': 'January', 'Feb': 'February', 'Mar': 'March',
        'Apr': 'April', 'May': 'May', 'Jun': 'June',
        'Jul': 'July', 'Aug': 'August', 'Sep': 'September',
        'Oct': 'October', 'Nov': 'November', 'Dec': 'December'
    };
    return monthMap[shortMonth] || shortMonth;
}

// Helper function to format dates consistently
function formatDate(date: Date | number, period: ChartPeriod = 'monthly'): { shortFormat: string, longFormat: string } {
    // Convert timestamp to Date if needed
    if (typeof date === 'number') {
        date = new Date(date * 1000);
    }
    
    // Format differently based on period
    let shortFormat: string;
    let longFormat: string;
    
    switch (period) {
        case 'daily':
            shortFormat = date.toLocaleString('en-US', { 
                month: 'short', 
                day: 'numeric',
                year: 'numeric',
                timeZone: 'UTC'
            });
            longFormat = date.toLocaleString('en-US', { 
                month: 'long', 
                day: 'numeric',
                year: 'numeric',
                timeZone: 'UTC'
            });
            break;
        case 'weekly':
            shortFormat = date.toLocaleString('en-US', { 
                month: 'short', 
                day: 'numeric',
                year: 'numeric',
                timeZone: 'UTC'
            });
            longFormat = date.toLocaleString('en-US', { 
                month: 'long', 
                day: 'numeric',
                year: 'numeric',
                timeZone: 'UTC'
            });
            break;
        case 'monthly':
        default:
            shortFormat = date.toLocaleString('en-US', { 
                month: 'short', 
                year: 'numeric',
                timeZone: 'UTC'
            });
            longFormat = date.toLocaleString('en-US', { 
                month: 'long', 
                year: 'numeric',
                timeZone: 'UTC'
            });
            break;
    }
    
    return { shortFormat, longFormat };
}

// Helper function to get Yahoo Finance interval based on chart period
function getYahooInterval(period: ChartPeriod): "1d" | "1wk" | "1mo" {
    switch (period) {
        case 'daily': return "1d";
        case 'weekly': return "1wk";
        case 'monthly': return "1mo";
        default: return "1mo";
    }
}

// Helper function to determine if a date is the start of a new month
function isStartOfMonth(date: Date): boolean {
    return date.getUTCDate() === 1;
}

// Helper function to determine if a date is the start of a new week (Monday)
function isStartOfWeek(date: Date): boolean {
    return date.getUTCDay() === 1; // 1 is Monday in JS Date
}

// Helper function to get the month key (used for dividends tracking)
function getMonthKey(date: Date): string {
    return date.toLocaleString('en-US', { 
        month: 'short', 
        year: 'numeric',
        timeZone: 'UTC'
    });
}

async function fetchStockData(symbol: string, startDate: string, endDate: string, period: ChartPeriod = 'monthly'): Promise<StockDataPoint[]> {
    console.log(`Fetching ${period} stock data for ${symbol} from ${startDate} to ${endDate}`);
    
    // Get Yahoo Finance interval based on period
    const interval = getYahooInterval(period);
    
    // Use chart API instead of historical API
    const result = (await yahooFinance.chart(symbol, {
        period1: startDate,
        period2: endDate,
        interval: interval,
        events: 'div' // Include dividends
    }) as unknown) as YahooAPIResponse;

    if (!result.quotes) {
        throw new Error('Failed to fetch stock data');
    }

    // Create a map of months to dividends (only apply dividends in monthly data)
    const dividendMap = new Map<string, number>();
    if (result.events?.dividends) {
        for (const dividend of result.events.dividends) {
            const date = new Date(dividend.date * 1000);
            const monthKey = getMonthKey(date);
            
            // If multiple dividends in same month, add them
            const existingDividend = dividendMap.get(monthKey) || 0;
            dividendMap.set(monthKey, existingDividend + dividend.amount);
            
            console.log(`Found dividend: $${dividend.amount} on ${date.toISOString().split('T')[0]} (${monthKey})`);
        }
    }

    // Combine price and dividend data
    return result.quotes.map(quote => {
        if (!quote.close) {
            throw new Error('Missing stock price data');
        }
        
        const date = new Date(quote.date);
        const { shortFormat, longFormat } = formatDate(date, period);
        
        // For non-monthly periods, most points won't have dividends
        let dividend = 0;
        if (period === 'monthly') {
            // For monthly data, apply the dividend if it exists
            dividend = dividendMap.get(shortFormat) || 0;
            if (dividend > 0) {
                console.log(`Month ${shortFormat}: Dividend amount ${dividend}`);
            }
        }
        
        return {
            date: shortFormat,
            formattedDate: longFormat,
            value: quote.close,
            dividend: dividend,
            timestamp: quote.date
        };
    });
}

// Function to fetch monthly stock data (always needed for investment calculations)
async function fetchMonthlyStockData(symbol: string, startDate: string, endDate: string): Promise<StockDataPoint[]> {
    return fetchStockData(symbol, startDate, endDate, 'monthly');
}

export class TikTokStockVideoGenerator {
    private chartService!: ChartService;
    private videoService: VideoService;
    private readonly config: ChartConfig;

    constructor(config: ChartConfig) {
        console.log('Initializing TikTok Stock Video Generator...');
        this.videoService = new VideoService();
        this.config = {
            ...config,
            chartDuration: config.chartDuration ?? 20,  // Default 20 seconds for chart
            endingDuration: config.endingDuration ?? 3  // Default 3 seconds for ending
        };
        
        // Default to monthly if not specified
        if (!this.config.chartPeriod) {
            this.config.chartPeriod = 'monthly';
        }
    }

    async generateVideo(stockSymbol: string, startDate: string, endDate: string, monthlyInvestment: number, title: string, outputPath: string, initialBalance: number) {
        console.log('Starting video generation with config:', {
            stockSymbol,
            startDate,
            endDate,
            monthlyInvestment,
            title,
            outputPath,
            initialBalance,
            chartPeriod: this.config.chartPeriod
        });

        // Initialize video service
        console.log('Initializing video service...');
        await this.videoService.initialize();

        // Always fetch monthly data for investment calculations
        console.log('Fetching monthly stock data for investment calculations...');
        const monthlyStockData = await fetchMonthlyStockData(stockSymbol, startDate, endDate);
        console.log(`Fetched ${monthlyStockData.length} monthly data points`);

        // Calculate investment growth (always monthly)
        console.log('Calculating monthly investment growth...');
        const monthlyData = this.calculateInvestmentGrowth(monthlyStockData, monthlyInvestment, initialBalance);

        // Fetch chart period data if different from monthly
        let chartData: ChartDataPoint[] = [];
        
        if (this.config.chartPeriod === 'monthly') {
            // If chart period is monthly, just use monthly data directly
            chartData = monthlyData.map(point => ({
                date: point.date,
                formattedDate: point.formattedDate,
                portfolioValue: point.portfolioValue,
                totalInvested: point.totalInvested,
                shares: point.shares,
                totalDividends: point.totalDividends,
                stockPrice: point.stockPrice
            }));
        } else {
            // For daily or weekly, we need to fetch that data and interpolate
            console.log(`Fetching ${this.config.chartPeriod} data for chart display...`);
            const periodStockData = await fetchStockData(stockSymbol, startDate, endDate, this.config.chartPeriod);
            console.log(`Fetched ${periodStockData.length} ${this.config.chartPeriod} data points`);
            
            // Interpolate monthly investment data to match the chart period
            chartData = this.interpolateChartData(periodStockData, monthlyData);
        }

        // Initialize chart service with chart data
        console.log('Initializing chart service...');
        this.chartService = new ChartService(this.config, chartData.map(d => d.stockPrice));

        const finalMonthlyData = monthlyData[monthlyData.length - 1];
        console.log('\nFinal Results:');
        console.log(`Time period: ${monthlyData[0].formattedDate} - ${finalMonthlyData.formattedDate}`);
        console.log(`Current Stock Price: $${finalMonthlyData.stockPrice.toFixed(2)}`);
        console.log(`Shares Owned: ${finalMonthlyData.shares.toLocaleString()}`);
        console.log(`Total Invested: $${finalMonthlyData.totalInvested.toLocaleString()}`);
        console.log(`Total Dividends: $${Math.round(finalMonthlyData.totalDividends).toLocaleString()}`);
        console.log(`Cash Balance: $${finalMonthlyData.cashBalance.toFixed(2)}`);
        console.log(`Portfolio Value: $${Math.round(finalMonthlyData.portfolioValue).toLocaleString()}`);
        console.log(`Return: ${((finalMonthlyData.portfolioValue / finalMonthlyData.totalInvested - 1) * 100).toFixed(2)}%`);

        // Generate video frames
        console.log('Starting video frame generation...');
        const frames: Buffer[] = [];
        let frameCount = 0;

        // Get the total invested values for each point in time
        const totalInputOverTime = chartData.map(d => d.totalInvested);

        // Track the last month's data for display info
        let currentMonthlyData = monthlyData[0];
        
        // Calculate frames per second (30fps)
        const fps = 30;
        const chartFrames = Math.floor(this.config.chartDuration! * fps);
        const endingFrames = Math.floor(this.config.endingDuration! * fps);
        
        // Calculate frame step to ensure we use all data points within the chart duration
        const frameStep = Math.max(1, Math.floor(chartData.length / chartFrames));
        
        // Generate regular frames
        for (let i = 0; i < chartData.length; i += frameStep) {
            const point = chartData[i];
            
            // Find the appropriate monthly data point for displays (shares, dividends)
            // This is important because we only have this info on a monthly basis
            if (this.config.chartPeriod !== 'monthly') {
                const pointDate = new Date(point.formattedDate);
                
                // Find the corresponding or most recent monthly data point
                for (let j = 0; j < monthlyData.length; j++) {
                    const monthlyDate = new Date(monthlyData[j].formattedDate);
                    if (monthlyDate <= pointDate) {
                        currentMonthlyData = monthlyData[j];
                    } else {
                        break;
                    }
                }
            } else {
                currentMonthlyData = monthlyData[i];
            }

            await this.chartService.updateChart(
                chartData.slice(0, i + 1).map(d => d.date),           // x-axis labels
                chartData.slice(0, i + 1).map(d => d.portfolioValue), // portfolio values for chart
                title,                                                 // title of video
                totalInputOverTime.slice(0, i + 1),                   // total input over time
                currentMonthlyData.shares,                            // current shares from monthly
                currentMonthlyData.totalDividends,                    // total dividends from monthly
                point.formattedDate,                                  // current date formatted
                point.stockPrice,                                     // current stock price
                false                                                 // not final frame
            );

            // Add frame
            frames.push(this.chartService.getFrame());

            frameCount++;
            if (frameCount % 10 === 0) {
                console.log(`Generated ${frameCount} frames...`);
            }
        }

        // Generate dramatic final frames
        console.log('Generating final dramatic frames...');
        
        // Use the final data point
        const lastPoint = chartData[chartData.length - 1];
        const lastMonthlyPoint = monthlyData[monthlyData.length - 1];
        
        // Generate exactly endingDuration seconds worth of frames
        for (let i = 0; i < endingFrames; i++) {
            await this.chartService.updateChart(
                chartData.map(d => d.date),
                chartData.map(d => d.portfolioValue),
                title,
                totalInputOverTime,
                lastMonthlyPoint.shares,
                lastMonthlyPoint.totalDividends,
                lastPoint.formattedDate,
                lastPoint.stockPrice,
                true // final frame with dramatic overlay
            );

            frames.push(this.chartService.getFrame());
            frameCount++;
        }

        console.log(`Total frames generated: ${frames.length}`);

        try {
            // Create final video
            console.log('Creating final video...');
            
            // Use the configured total duration
            const totalDuration = this.config.chartDuration! + this.config.endingDuration!;
            await this.videoService.createVideo(frames, outputPath, undefined);
            console.log('Video creation complete!');
        } finally {
            // Clean up temporary files
            console.log('Cleaning up temporary files...');
            await this.videoService.cleanup();
        }
    }

    private interpolateChartData(periodStockData: StockDataPoint[], monthlyData: MonthlyDataPoint[]): ChartDataPoint[] {
        console.log('Interpolating chart data from monthly investment calculations...');
        
        return periodStockData.map(periodPoint => {
            const periodDate = new Date(periodPoint.formattedDate);
            
            // Find the appropriate monthly point that's closest without going over
            let matchingMonthlyIndex = 0;
            for (let i = 0; i < monthlyData.length; i++) {
                const monthlyDate = new Date(monthlyData[i].formattedDate);
                if (monthlyDate <= periodDate) {
                    matchingMonthlyIndex = i;
                } else {
                    break;
                }
            }
            
            const prevMonthly = monthlyData[matchingMonthlyIndex];
            
            // If this is the exact monthly point, use those values
            if (periodPoint.date === prevMonthly.date) {
                return {
                    date: periodPoint.date,
                    formattedDate: periodPoint.formattedDate,
                    portfolioValue: prevMonthly.portfolioValue,
                    totalInvested: prevMonthly.totalInvested,
                    stockPrice: periodPoint.value
                };
            }
            
            // Otherwise, we need to interpolate the portfolio value
            // The key insight: stock price changes affect portfolio value proportionally
            
            // Calculate percentage change in stock price from previous month
            const priceRatio = periodPoint.value / prevMonthly.stockPrice;
            
            // Adjust share value by price change ratio (shares * current price)
            const shareValue = prevMonthly.shares * periodPoint.value;
            
            // Portfolio value is share value plus cash balance
            const portfolioValue = shareValue + prevMonthly.cashBalance;
            
            return {
                date: periodPoint.date,
                formattedDate: periodPoint.formattedDate,
                portfolioValue: portfolioValue,
                totalInvested: prevMonthly.totalInvested,
                stockPrice: periodPoint.value
            };
        });
    }

    private calculateInvestmentGrowth(data: StockDataPoint[], monthlyInvestment: number, initialBalance: number = 0): MonthlyDataPoint[] {
        let totalShares = 0;
        let cashBalance = initialBalance;
        let totalInvested = initialBalance;
        let totalDividendsReceived = 0;
        
        console.log('Calculating investment growth with whole share purchases and dividend reinvestment...');
        console.log(`Initial balance: $${initialBalance}`);
        console.log(`Monthly investment: $${monthlyInvestment}`);
        console.log(`Time period: ${data[0].formattedDate} - ${data[data.length-1].formattedDate}`);
        console.log(`Total months: ${data.length}`);
        console.log('---------------------------------------------');
        
        // Buy initial shares with starting balance if any
        if (initialBalance > 0) {
            const initialSharesToBuy = Math.floor(initialBalance / data[0].value);
            if (initialSharesToBuy > 0) {
                const initialCost = initialSharesToBuy * data[0].value;
                cashBalance -= initialCost;
                totalShares += initialSharesToBuy;
                console.log(`\nInitial Purchase:`);
                console.log(`  Bought ${initialSharesToBuy} shares at ${data[0].value.toFixed(2)} for ${initialCost.toFixed(2)}`);
                console.log(`  Remaining cash: ${cashBalance.toFixed(2)}`);
            }
        }
        
        return data.map((dataPoint, index) => {
            console.log(`\n--- ${dataPoint.formattedDate} ---`);
            console.log(`  Starting: ${totalShares} shares, ${cashBalance.toFixed(2)} cash`);
            
            // Add monthly investment
            cashBalance += monthlyInvestment;
            totalInvested += monthlyInvestment;
            console.log(`  Added monthly ${monthlyInvestment} investment. Cash: ${cashBalance.toFixed(2)}`);
            
            // Process dividends (if any)
            if (dataPoint.dividend > 0 && totalShares > 0) {
                const dividendAmount = dataPoint.dividend * totalShares;
                totalDividendsReceived += dividendAmount;
                cashBalance += dividendAmount;
                
                console.log(`  Received ${dividendAmount.toFixed(2)} in dividends (${dataPoint.dividend.toFixed(4)} × ${totalShares} shares)`);
                console.log(`  Cash after dividends: ${cashBalance.toFixed(2)}`);
            }
            
            // Buy whole shares with available cash
            const sharesToBuy = Math.floor(cashBalance / dataPoint.value);
            
            if (sharesToBuy > 0) {
                const cost = sharesToBuy * dataPoint.value;
                cashBalance -= cost;
                totalShares += sharesToBuy;
                
                console.log(`  Bought ${sharesToBuy} shares at ${dataPoint.value.toFixed(2)} for ${cost.toFixed(2)}`);
                console.log(`  Remaining cash: ${cashBalance.toFixed(2)}`);
            } else {
                console.log(`  No shares bought. Stock price: ${dataPoint.value.toFixed(2)}`);
            }
            
            // Calculate portfolio value (shares * current price + remaining cash)
            const portfolioValue = (dataPoint.value * totalShares) + cashBalance;
            
            console.log(`  End: ${totalShares} shares × ${dataPoint.value.toFixed(2)} + ${cashBalance.toFixed(2)} cash = ${portfolioValue.toFixed(2)}`);
            
            return {
                date: dataPoint.date,                   // Short date format ('Jan 2020')
                formattedDate: dataPoint.formattedDate, // Full date format ('January 2020')
                stockPrice: dataPoint.value,            // Current stock price
                shares: totalShares,                    // Current shares owned
                totalInvested: totalInvested,           // Total money invested (monthly contributions)
                portfolioValue: portfolioValue,         // Total portfolio value (shares + cash)
                totalDividends: totalDividendsReceived, // Total dividends received
                cashBalance: cashBalance                // Current cash balance
            };
        });
    }
}

interface CliArgs {
    ticker: string;
    start: string;
    end: string;
    monthly: number;
    balance: number;
    title: string;
    image?: string;
    output: string;
    period?: ChartPeriod;
}

async function main() {
    const argv = yargs(hideBin(process.argv))
        .option('ticker', {
            alias: 't',
            type: 'string',
            description: 'Stock ticker symbol',
            demandOption: true
        })
        .option('start', {
            alias: 's',
            type: 'string',
            description: 'Start date (YYYY-MM-DD)',
            demandOption: true
        })
        .option('end', {
            alias: 'e',
            type: 'string',
            description: 'End date (YYYY-MM-DD)',
            demandOption: true
        })
        .option('monthly', {
            alias: 'm',
            type: 'number',
            description: 'Monthly investment amount',
            demandOption: true
        })
        .option('balance', {
            alias: 'b',
            type: 'number',
            description: 'Initial investment balance',
            default: 0
        })
        .option('title', {
            type: 'string',
            description: 'Video title',
            demandOption: true
        })
        .option('image', {
            alias: 'i',
            type: 'string',
            description: 'Path to company logo image'
        })
        .option('period', {
            alias: 'p',
            type: 'string',
            description: 'Chart display period (daily, weekly, monthly)',
            choices: ['daily', 'weekly', 'monthly'],
            default: 'monthly'
        })
        .option('output', {
            alias: 'o',
            type: 'string',
            description: 'Output video file path',
            default: (argv: Partial<CliArgs>) => `output.mp4`
        })
        .help()
        .parse() as unknown as CliArgs;

    try {
        const config: ChartConfig = {
            width: 1080,
            height: 1920,
            backgroundColor: '#000000',
            fontColor: '#FFFFFF',
            lineColor: '#00FF00',
            title: argv.title,
            chartHeight: 1000,
            infoFontSize: 36,
            valueFontSize: 48,
            chartPeriod: argv.period || 'monthly'
        };

        // Load image if provided
        if (argv.image) {
            try {
                config.imageBuffer = fs.readFileSync(path.resolve(argv.image));
            } catch (error) {
                console.error('Error loading image:', error);
                process.exit(1);
            }
        }

        const generator = new TikTokStockVideoGenerator(config);
        await generator.generateVideo(
            argv.ticker,
            argv.start,
            argv.end,
            argv.monthly,
            config.title,
            argv.output,
            argv.balance
        );
    
    } catch (error) {
        console.error('Error generating video:', error);
        process.exit(1);
    }
}

main();