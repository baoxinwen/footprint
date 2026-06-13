export interface User {
  id: number
  username: string
}

export interface Trip {
  id: number
  title: string
  description: string | null
  start_date: string
  end_date: string
  created_at: string
  updated_at: string
  location_count: number
  cities: string[]
}

export interface TripDetail {
  id: number
  title: string
  description: string | null
  start_date: string
  end_date: string
  created_at: string
  updated_at: string
  locations: Location[]
}

export interface Location {
  id: number
  name: string
  address: string
  longitude: number
  latitude: number
  city: string
  province: string
  note: string | null
  sort_order: number
  photo_count: number
}

export interface Photo {
  id: number
  location_id: number
  original_url: string
  thumbnail_url: string
  file_name: string
  file_size: number
  created_at: string
}

export interface CityMarker {
  city: string
  province: string
  longitude: number
  latitude: number
  count: number
}

export interface TripRoute {
  trip_id: number
  title: string
  color: string
  locations: { name: string; longitude: number; latitude: number }[]
}

export interface OverviewStats {
  trip_count: number
  city_count: number
  province_count: number
  total_days: number
}

export interface YearlyStats {
  year: number
  count: number
}

export interface MonthlyStats {
  month: number
  count: number
}

export interface CityRank {
  city: string
  count: number
}

export interface MapStats {
  trip_count: number
  location_count: number
  city_count: number
  province_count: number
}

export interface TimelineGroup {
  year: number
  month: number
  label: string
  count: number
  trips: { id: number; title: string; description: string | null; start_date: string; end_date: string }[]
}

export interface TripListResponse {
  total: number
  page: number
  page_size: number
  items: Trip[]
}

export interface ShareResponse {
  token: string
  url: string
  expires_at: string
}

export interface AmapPoi {
  name: string
  address: string
  location: { lng: number; lat: number }
  cityname: string
  pname: string
}

export interface PhotoMapMarker {
  photo_id: number
  thumbnail_url: string
  original_url: string
  location_name: string
  longitude: number
  latitude: number
  city: string
  trip_id: number
  trip_title: string
}

export interface SearchResult {
  trips: { id: number; title: string; description: string | null; start_date: string; end_date: string }[]
  locations: { id: number; name: string; address: string; city: string; province: string; trip_id: number; trip_title: string }[]
}
