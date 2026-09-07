# Estimate visitors from daily IP counts

Estimate visitors by counting distinct IP addresses within each UTC day, using a keyed hash that changes each day.
Keep daily totals and discard identifying hashes after aggregation, rather than using visitor cookies or lasting visitor identifiers.
This choice avoids linking public reading activity across days, but shared networks, changing addresses, and bots limit the estimate's accuracy.

Daily estimates cannot be added to produce a unique visitor count for a week or month.
The separate IP-linked abuse activity history remains subject to its indefinite retention decision.
