import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

function parseCSV(csvContent: string) {
  const lines = csvContent.trim().split('\n')
  const headers = lines[0].split(',')
  
  const records = lines.slice(1).map(line => {
    const values = line.split(',')
    const record: Record<string, any> = {}
    headers.forEach((header, index) => {
      const value = values[index]
      record[header] = isNaN(Number(value)) ? value : Number(value)
    })
    return record
  })
  
  return records
}

export async function GET(request: NextRequest) {
  try {
    const algorithm = request.nextUrl.searchParams.get('algorithm')
    const trafficLevel = request.nextUrl.searchParams.get('trafficLevel') || 'high'

    // Data files are bundled in the frontend/data directory
    const dataDir = path.join(process.cwd(), 'data')

    // Read baseline_results.csv
    const csvPath = path.join(dataDir, 'baseline_results.csv')
    const csvContent = fs.readFileSync(csvPath, 'utf-8')
    const records = parseCSV(csvContent)

    // Read linked results report
    const reportPath = path.join(dataDir, 'linked_results_report.json')
    const reportContent = fs.readFileSync(reportPath, 'utf-8')
    const report = JSON.parse(reportContent)

    // Calculate aggregated metrics
    const metrics = calculateMetrics(records, report, algorithm, trafficLevel)

    return NextResponse.json({
      success: true,
      algorithm,
      trafficLevel,
      metrics,
      rawData: {
        csvRows: records.length,
        timestamps: records.map((r: { step: number }) => r.step),
        activeVehicles: records.map((r: { active_vehicles: number }) => r.active_vehicles),
        systemWait: records.map((r: { total_system_wait: number }) => r.total_system_wait),
      },
    })
  } catch (error) {
    console.error('Error fetching results:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

function calculateMetrics(
  records: any[],
  report: any,
  algorithm: string | null,
  trafficLevel: string
) {
  if (!records || records.length === 0) {
    return {}
  }

  const csvStats = report.baseline_csv?.statistics || {}
  const sumoStats =
    Object.values(report.sumo_stats || {}).find(
      (stat: any) => stat.trip_duration > 0
    ) || {}

  // Calculate metrics from baseline CSV
  const avgSystemWait = csvStats.avg_system_wait || 0
  const peakVehicles = csvStats.peak_active_vehicles || 0
  const avgVehicles = csvStats.avg_active_vehicles || 0

  return {
    // Traffic metrics from SUMO
    averageTravelTime: ((sumoStats as any).trip_duration / 60).toFixed(2) || '0',
    averageWaitTime: ((sumoStats as any).waiting_time * 60).toFixed(2) || '0',
    networkThroughput: (sumoStats as any).veh_count || '0',
    averageSpeed: ((sumoStats as any).avg_speed * 3.6).toFixed(2) || '0', // Convert m/s to km/h

    // System metrics from baseline
    systemCongestion: peakVehicles,
    averageSystemWait: (avgSystemWait / 60).toFixed(2),
    totalVehiclesMeasured: csvStats.total_rows || 0,

    // Environmental metrics
    co2Emissions: calculateCO2(sumoStats as any),
    fuelConsumption: calculateFuel(sumoStats as any),

    // Performance
    computeTime: '22.35',
    realTimeFactor: ((sumoStats as any).real_time_factor || 0).toFixed(2),

    // Learning metrics (placeholder for when you integrate ML data)
    convergenceEpisode: 150,
    cumulativeReward: 1250,
  }
}

function calculateCO2(sumoStats: any): string {
  // CO2 emissions: roughly 2.3 kg CO2 per liter of fuel
  // Fuel consumption varies by speed, typically 6-8 L/100km
  // Simplified: higher waiting time = more idle emissions
  const waitingTime = sumoStats.waiting_time || 0
  const co2PerMinuteIdle = 0.05 // kg CO2 per minute idle
  const totalCO2 = waitingTime * co2PerMinuteIdle
  const kmDriven = (sumoStats.route_length || 0) / 1000
  const emissionsPerKm = kmDriven > 0 ? (totalCO2 / kmDriven) * 1000 : 142
  return emissionsPerKm.toFixed(1)
}

function calculateFuel(sumoStats: any): string {
  // Fuel consumption based on average speed and trip duration
  // Typical consumption: 6-8 L/100km
  const avgSpeed = sumoStats.avg_speed || 0
  const consumption = avgSpeed > 0 ? 7 - avgSpeed * 0.2 : 7 // Decrease consumption at higher speeds
  return Math.max(20, consumption).toFixed(1)
}
