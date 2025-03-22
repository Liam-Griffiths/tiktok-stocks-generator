export interface ChartConfig {
    width: number;
    height: number;
    backgroundColor: string;
    fontColor: string;
    lineColor: string;
    title: string;
    imageBuffer?: Buffer;  // Buffer containing the image data
    chartHeight?: number;  // Height reserved for the chart
    infoFontSize?: number;  // Font size for the info rows
    valueFontSize?: number;  // Font size for the total value
    chartPeriod?: ChartPeriod; // Period for chart display (daily, weekly, monthly)
    chartDuration?: number;  // Duration in seconds for the main chart animation
    endingDuration?: number; // Duration in seconds for the final dramatic ending
}

export type ChartPeriod = 'daily' | 'weekly' | 'monthly';

export interface ChartDimensions {
    width: number;
    height: number;
    padding: number;
    chartArea: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    titleArea: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    infoArea: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}

export interface StockData {
    date: string;
    value: number;
    dividend: number;
}

export interface VideoConfig {
    title: string;
    outputPath: string;
    stockSymbol: string;
    startDate: string;
    endDate: string;
    monthlyInvestment: number;
    chartPeriod?: ChartPeriod;
}

export interface MonthlyDataPoint {
    date: string;
    value: number;
    shares: number;
    totalInvested: number;
    portfolioValue: number;
}